import {Location} from "history";
import * as React from "react";
import {Link} from "react-router";
import {InjectedRouter} from "react-router";
import {context} from "sourcegraph/app/context";

import {Base, FlexContainer, Logo} from "sourcegraph/components";
import {colors, layout} from "sourcegraph/components/utils";

import * as styles from "sourcegraph/app/styles/GlobalNav.css";

import {BetaSignup, Integrations, Login, Signup} from "sourcegraph/app/modals/index";
import {DemoVideo} from "sourcegraph/home/modals/DemoVideo";

import {SearchCTA} from "sourcegraph/app/GlobalNav/SearchCTA";
import {SignupOrLogin} from "sourcegraph/app/GlobalNav/SignupOrLogin";
import {UserMenu} from "sourcegraph/app/GlobalNav/UserMenu";
import {QuickOpenModal} from "sourcegraph/quickopen/Modal";

import {LocationState} from "sourcegraph/app/locationState";
import {isRootRoute} from "sourcegraph/app/routePatterns";
import {repoParam, repoPath, repoRev} from "sourcegraph/repo";

interface Props {
	navContext?: JSX.Element;
	location: Location & {state: LocationState};
	params: any;
	channelStatusCode?: number;
	role?: string;
}

interface State {
	showSearch: boolean;
}

export class GlobalNav extends React.Component<Props, State> {

	constructor() {
		super();
		this.onSearchDismiss = this.onSearchDismiss.bind(this);
		this.activateSearch = this.activateSearch.bind(this);
		this.state = {
			showSearch: false,
		};
	}

	static contextTypes: React.ValidationMap<any> = {
		router: React.PropTypes.object.isRequired,
	};

	context: { router: InjectedRouter };

	onSearchDismiss(): void {
		this.setState({showSearch: false});
	}

	activateSearch(): void {
		this.setState({showSearch: true});
	}

	render(): JSX.Element {

		const {location, params} = this.props;

		const hiddenNavRoutes = new Set([
			"/",
			"/styleguide",
			"login",
			"join",
		]);

		const dash = isRootRoute(location) && context.user;
		const shouldHide = hiddenNavRoutes.has(location.pathname) && !dash;

		const revSpec = repoParam(params.splat);
		const [repo, rev] = revSpec ?
			[repoPath(revSpec), repoRev(revSpec)] :
			[null, null];

		const sx = {
			backgroundColor: colors.white(),
			borderBottom: `1px solid ${colors.coolGray3(0.3)}`,
			boxShadow: `${colors.coolGray3(0.1)} 0px 1px 6px 0px`,
			display: shouldHide ? "none" : "block",
			zIndex: 100,
		};

		let modal = <div />;
		if (location.state) {
			const m = location.state.modal;
			modal = <div>
				{m === "login" && !context.user && <Login location={location}/>}
				{m === "join" && <Signup location={location} router={this.context.router} shouldHide={shouldHide}/>}
				{m === "menuBeta" && <BetaSignup location={location} router={this.context.router} />}
				{m === "menuIntegrations" && <Integrations location={location} router={this.context.router} />}
				{m === "demo_video" && <DemoVideo location={location} />}
			</div>;
		}
		return <Base
			{...layout.clearFix}
			id="global-nav"
			role="navigation"
			px={2}
			py={1}
			style={sx}>

			{modal}

			<FlexContainer justify="between" items="center">
				<Link to="/" style={{lineHeight: "0"}}>
					<Base p={2}>
						<Logo className={styles.logomark}
						width="20px"
						type="logomark"/>
					</Base>
				</Link>

				<QuickOpenModal repo={repo} rev={rev}
					showModal={this.state.showSearch}
					activateSearch={this.activateSearch}
					onDismiss={this.onSearchDismiss} />
				<FlexContainer items="center" style={{paddingRight: "0.5rem"}}>
					<a style={{flex: "0 0 auto"}} onClick={this.activateSearch}><SearchCTA /></a>
					{context.user
						? <UserMenu user={context.user} location={location} style={{flex: "0 0 auto", marginTop: 4}} />
						: <SignupOrLogin user={context.user} location={location} />
					}
				</FlexContainer>
			</FlexContainer>
		</Base>;
	}
};
