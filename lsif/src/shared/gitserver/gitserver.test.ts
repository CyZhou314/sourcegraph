import nock from 'nock'
import { flattenCommitParents, getCommitsNear, getDirectoryChildren } from './gitserver'

describe('getDirectoryChildren', () => {
    it('should parse response from gitserver', async () => {
        nock('http://frontend')
            .post('/.internal/git/42/exec', { args: ['ls-tree', '--name-only', 'c', '--', 'foo/bar/baz/'] })
            .reply(200, 'foo/bar/baz/a\nfoo/bar/baz/b\nfoo/bar/baz/c\nfoo/bar/baz/d\nfoo/bar/baz/e\n')

        expect(
            await getDirectoryChildren({
                frontendUrl: 'frontend',
                repositoryId: 42,
                commit: 'c',
                dirname: 'foo/bar/baz',
            })
        ).toEqual(new Set(['foo/bar/baz/a', 'foo/bar/baz/b', 'foo/bar/baz/c', 'foo/bar/baz/d', 'foo/bar/baz/e']))
    })

    it('should handle request for root directory', async () => {
        nock('http://frontend')
            .post('/.internal/git/42/exec', { args: ['ls-tree', '--name-only', 'c'] })
            .reply(200, 'a\nb\nc\nd\ne\n')

        expect(
            await getDirectoryChildren({ frontendUrl: 'frontend', repositoryId: 42, commit: 'c', dirname: '' })
        ).toEqual(new Set(['a', 'b', 'c', 'd', 'e']))
    })
})

describe('getCommitsNear', () => {
    it('should parse response from gitserver', async () => {
        nock('http://frontend')
            .post('/.internal/git/42/exec', { args: ['log', '--pretty=%H %P', 'l', '-150'] })
            .reply(200, 'a\nb c\nd e f\ng h i j k l')

        expect(await getCommitsNear('frontend', 42, 'l')).toEqual(
            new Map([
                ['a', new Set()],
                ['b', new Set(['c'])],
                ['d', new Set(['e', 'f'])],
                ['g', new Set(['h', 'i', 'j', 'k', 'l'])],
            ])
        )
    })

    it('should handle request for unknown repository', async () => {
        nock('http://frontend')
            .post('/.internal/git/42/exec')
            .reply(404)

        expect(await getCommitsNear('frontend', 42, 'l')).toEqual(new Map())
    })
})

describe('flattenCommitParents', () => {
    it('should handle multiple commits', () => {
        expect(flattenCommitParents(['a', 'b c', 'd e f', '', 'g h i j k l', 'm '])).toEqual(
            new Map([
                ['a', new Set()],
                ['b', new Set(['c'])],
                ['d', new Set(['e', 'f'])],
                ['g', new Set(['h', 'i', 'j', 'k', 'l'])],
                ['m', new Set()],
            ])
        )
    })
})
