import got from 'got'
import { MAX_COMMITS_PER_UPDATE } from '../constants'
import { TracingContext, logAndTraceCall } from '../tracing'
import { instrument } from '../metrics'
import * as metrics from './metrics'

/**
 * Get the children of a set of directories at a particular commit. This function
 * returns a list of sets `L` where `L[i]` is the set of children for `dirnames[i]`.
 *
 * @param args Parameter bag.
 */
export async function getDirectoryChildren({
    frontendUrl,
    repositoryId,
    commit,
    dirnames,
    ctx = {},
}: {
    /** The url of the frontend internal API. */
    frontendUrl: string
    /** The repository identifier. */
    repositoryId: number
    /** The commit from which the gitserver queries should start. */
    commit: string
    /** A list of repo-root-relative directories. */
    dirnames: string[]
    /** The tracing context. */
    ctx?: TracingContext
}): Promise<Set<string>[]> {
    const requests: { args: string[] }[] = []
    for (const dirname of dirnames) {
        const args = ['ls-tree', '--name-only', commit]
        if (dirname !== '') {
            args.push('--', dirname.endsWith('/') ? dirname : dirname + '/')
        }

        requests.push({ args })
    }

    return (await gitserverBatchExecLines(frontendUrl, repositoryId, requests, ctx)).map(contents => new Set(contents))
}

/**
 * Get a list of commits for the given repository with their parent starting at the
 * given commit and returning at most `MAX_COMMITS_PER_UPDATE` commits. The output
 * is a map from commits to a set of parent commits. The set of parents may be empty.
 *
 * If the repository or commit is unknown by gitserver, then the the results will be
 * empty but no error will be thrown. Any other error type will be thrown without
 * modification.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param commit The commit from which the gitserver queries should start.
 * @param ctx The tracing context.
 */
export async function getCommitsNear(
    frontendUrl: string,
    repositoryId: number,
    commit: string,
    ctx: TracingContext = {}
): Promise<Map<string, Set<string>>> {
    const args = ['log', '--pretty=%H %P', commit, `-${MAX_COMMITS_PER_UPDATE}`]

    try {
        return flattenCommitParents(await gitserverExecLines(frontendUrl, repositoryId, args, ctx))
    } catch (error) {
        if (error.statusCode === 404) {
            // repository unknown
            return new Map()
        }

        throw error
    }
}

/**
 * Convert git log output into a parentage map. Each line of the input should have the
 * form `commit p1 p2 p3...`, where commits without a parent appear on a line of their
 * own. The output is a map from commits a set of parent commits. The set of parents may
 * be empty.
 *
 * @param lines The output lines of `git log`.
 */
export function flattenCommitParents(lines: string[]): Map<string, Set<string>> {
    const commits = new Map()
    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '') {
            continue
        }

        const [child, ...parentCommits] = trimmed.split(' ')
        commits.set(child, new Set<string>(parentCommits))
    }

    return commits
}

/**
 * Get the current tip of the default branch of the given repository.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param ctx The tracing context.
 */
export async function getHead(
    frontendUrl: string,
    repositoryId: number,
    ctx: TracingContext = {}
): Promise<string | undefined> {
    const lines = await gitserverExecLines(frontendUrl, repositoryId, ['rev-parse', 'HEAD'], ctx)
    if (lines.length === 0) {
        return undefined
    }

    return lines[0]
}

/**
 * Execute a git command via gitserver and return its output split into non-empty lines.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param args The command to run in the repository's git directory.
 * @param ctx The tracing context.
 */
async function gitserverExecLines(
    frontendUrl: string,
    repositoryId: number,
    args: string[],
    ctx: TracingContext = {}
): Promise<string[]> {
    return (await gitserverExec(frontendUrl, repositoryId, args, ctx)).split('\n').filter(line => Boolean(line))
}

/**
 * Execute a batch of git commands via gitserver and return the output of each command
 * into non-empty line. This function returns a list of exploded lines `L` where `L[i]`
 * is the stdout of the `i`th request.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param requests The batch of requests to run in the repository's git directory.
 * @param ctx The tracing context.
 */
async function gitserverBatchExecLines(
    frontendUrl: string,
    repositoryId: number,
    requests: { args: string[] }[],
    ctx: TracingContext = {}
): Promise<string[][]> {
    return (await gitserverBatchExec(frontendUrl, repositoryId, requests, ctx)).map(stdout =>
        stdout.split('\n').filter(line => Boolean(line))
    )
}

/**
 * Execute a git command via gitserver and return its raw output.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param args The command to run in the repository's git directory.
 * @param ctx The tracing context.
 */
function gitserverExec(
    frontendUrl: string,
    repositoryId: number,
    args: string[],
    ctx: TracingContext = {}
): Promise<string> {
    validateArgs(args)

    return logAndTraceCall(ctx, 'Executing git command', () =>
        instrument(metrics.gitserverDurationHistogram, metrics.gitserverErrorsCounter, async () => {
            // Perform request - this may fail with a 404 or 500
            const resp = await got(new URL(`http://${frontendUrl}/.internal/git/${repositoryId}/exec`).href, {
                body: JSON.stringify({ args }),
            })

            const stderr = resp.trailers['x-exec-stderr']
            const status = resp.trailers['x-exec-exit-status']

            // Determine if underlying git command failed and throw an error
            // in that case. Status will be undefined in some of our tests and
            // will be the process exit code (given as a string) otherwise.
            if (status !== undefined && status !== '0') {
                throw new Error(`Failed to run git command ${['git', ...args].join(' ')}: ${stderr}`)
            }

            return resp.body
        })
    )
}

/**
 * Execute a batch of git commands via gitserver and return the the raw output of each
 * command. This function returns a list of strings `L` where `L[i]` is the stdout of
 * the `i`th request.
 *
 * @param frontendUrl The url of the frontend internal API.
 * @param repositoryId The repository identifier.
 * @param requests The batch of requests to run in the repository's git directory.
 * @param ctx The tracing context.
 */
function gitserverBatchExec(
    frontendUrl: string,
    repositoryId: number,
    requests: { args: string[] }[],
    ctx: TracingContext = {}
): Promise<string[]> {
    for (const request of requests) {
        validateArgs(request.args)
    }

    return logAndTraceCall(ctx, 'Executing batch git command', () =>
        instrument(metrics.gitserverDurationHistogram, metrics.gitserverErrorsCounter, async () => {
            // Perform request - this may fail with a 404 or 500
            const resp = await got(new URL(`http://${frontendUrl}/.internal/git/${repositoryId}/batch-exec`).href, {
                body: JSON.stringify({ requests }),
            })

            const responses: { stdout: string; stderr: string; exitStatus?: number }[] = JSON.parse(resp.body)

            for (const [i, { exitStatus, stderr }] of responses.entries()) {
                if (exitStatus !== undefined && exitStatus !== 0) {
                    throw new Error(`Failed to run git command ${['git', ...requests[i].args].join(' ')}: ${stderr}`)
                }
            }

            return responses.map(({ stdout }) => stdout)
        })
    )
}

/**
 * Prevent this from happening again:
 *   - https://github.com/sourcegraph/sourcegraph/pull/5941
 *   - https://github.com/sourcegraph/sourcegraph/pull/6548
 */
function validateArgs(args: string[]): void {
    if (args[0] === 'git') {
        throw new Error('Gitserver commands should not be prefixed with `git`')
    }
}
