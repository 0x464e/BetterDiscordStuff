/// <reference path="../bdbuilder/typings/main.d.ts" />

import { Patcher, Utilities, WebpackModules, Logger, ReactComponents } from "@zlibrary"
import BasePlugin from "@zlibrary/plugin"
import StatusAvatar from "./components/avatar";
import stylesheet from "styles";
import React from "react";
import SettingsPanel from "./components/settings";
import _ from "lodash";
import Settings from "./settings";
import { joinClassNames } from "@discord/utils";
import { ChannelTypes } from "@discord/constants";
import { Channels, Users } from "@discord/stores";

export default class StatusEverywhere extends BasePlugin {
    public get StatusAvatar() { return StatusAvatar; }

    public getSettingsPanel() {
        const Panel = SettingsPanel as React.FunctionComponent<{}>;

        return (
            <Panel />
        );
    }

    public onStart(): void {
        Utilities.suppressErrors(() => {this.patchChatAvatar();}, "StatusEverywhere.patchChatAvatar")();
        Utilities.suppressErrors(() => {this.patchChannelMessage();}, "StatusEverywhere.patchChannelMessage")();
        Utilities.suppressErrors(() => {this.patchVoiceUser();}, "StatusEverywhere.patchVoiceUser")();
        Utilities.suppressErrors(() => {this.patchAuditlog();}, "StatusEverywhere.patchAuditlog")();
        Utilities.suppressErrors(() => {this.patchGuildSettingsMembers();}, "StatusEverywhere.patchGuildSettingsMembers")();
        Utilities.suppressErrors(() => {this.patchColorModule();}, "StatusEverywhere.patchColorModule")();
        Utilities.suppressErrors(() => {this.patchMemberListItem();}, "StatusEverywhere.patchMemberListItem")();
        Utilities.suppressErrors(() => {this.patchUserPopout();}, "StatusEverywhere.patchUserPopout")();
        Utilities.suppressErrors(() => {this.patchUserProfile();}, "StatusEverywhere.patchUserProfile")();
        Utilities.suppressErrors(() => {this.patchAvatar();}, "StatusEverywhere.patchAvatar")();
        Utilities.suppressErrors(() => {this.patchHeaderPlaying();}, "StatusEverywhere.patchHeaderPlaying")();
        Utilities.suppressErrors(() => {this.patchPrivateChannel();}, "StatusEverywhere.patchPrivateChannel")();
        Utilities.suppressErrors(() => {this.patchPartyMembers();}, "StatusEverywhere.patchPartyMembers")();
        Utilities.suppressErrors(() => {this.patchAccountSection();}, "StatusEverywhere.patchAccountSection")();

        stylesheet.inject();
    }

    private async patchColorModule(): Promise<void> {
        const StatusModule = WebpackModules.getByProps("getStatusColor");

        Patcher.after(StatusModule, "getStatusColor", (_, [status]) => {
            switch (status) {
                case "dnd":
                    return Settings.get("dndColor", "#ED4245");
                case "idle":
                    return Settings.get("idleColor", "#FAA81A");
                case "online":
                    return Settings.get("onlineColor", "#3BA55D");
                case "streaming":
                    return Settings.get("streamingColor", "#593695");
                case "offline":
                    return Settings.get("offlineColor", "#747F8D");
                default:
                    return "#747F8D";
            }
        });
    }

    private async patchAccountSection() {
        const accountSelector = `.${WebpackModules.getByProps("container", "avatar", "redIcon").container}`;
        const userSettingsSelector = `.${WebpackModules.getByProps("contentColumnDefault").contentColumnDefault + " > div"}`;

        ReactComponents.getComponentByName("Account", accountSelector).then(Account => {
            Patcher.after(Account.component.prototype, "render", (_, __, res) => {
                const tree = Utilities.findInReactTree(res, e => e?.renderPopout);
                if (!tree) return;
                const old: Function = tree.children;
    
                tree.children = (e: any) => {
                    const ret = old(e);
                    if (!ret) return ret;
                    const props = ret.props.children.props;
    
                    ret.props.children = (
                        <StatusAvatar
                            {...props}
                            user={Users.getCurrentUser()}
                            shouldWatch={false}
                            radial={{ id: "accountSettingsRadialStatus", value: false }}
                        />
                    );
    
                    return ret;
                };
            });
    
            Account.forceUpdateAll();
        });

        function PatchedUserSettingsAccountProfileCard(params: { __originalType: Function }) {
            const { __originalType, ...props } = params;
            const ret = __originalType(props);
            
            try {
                const avatar = Utilities.findInReactTree(ret, e => e?.props?.status);
                if (!avatar) return ret;

                Object.assign(avatar.props, {
                    user: Users.getCurrentUser(),
                    shouldWatch: false,
                    size: StatusAvatar.Sizes.SIZE_120,
                    animated: true,
                    className: joinClassNames(avatar.props.className, "accountSettingsAvatar"),
                    radial: {
                        id: "accountSettingsRadialStatus",
                        value: false
                    }
                });

                avatar.type = StatusAvatar;
            } catch (error) {
                Logger.error("Error in UserSettingsAccountCard:", error);
                return ret;
            }

            return ret;
        }

        ReactComponents.getComponentByName("UserSettingsAccount", userSettingsSelector).then(UserSettingsAccount => {
            Patcher.after(UserSettingsAccount.component.prototype, "renderAccountSettings", (_, __, res) => {
                const tree: Array<any> = Utilities.findInReactTree(res, e => Array.isArray(e) && e.some(e => e?.type?.displayName === "UserSettingsAccountProfileCard"));
                if (!tree) return;
                const index: number = tree.findIndex(e => e?.type?.displayName === "UserSettingsAccountProfileCard");
                const element = tree[index];

                tree[index] = React.createElement(PatchedUserSettingsAccountProfileCard, {
                    __originalType: element.type
                });
            });

            UserSettingsAccount.forceUpdateAll();
        });
    }

    private async patchPartyMembers() {
        const classes = {
            ...Object(WebpackModules.getByProps("partyMember")),
            ...Object(WebpackModules.getByProps("container", "activity", "partyAvatar"))
        };
        const selector = "." + Object.values(_.pick(classes, ["partyMember", "partyAvatar"]))
            .map(e => e.split(" ").join("."))
            .join(", .");
        const VoiceUserSummaryItem = WebpackModules.getByDisplayName("VoiceUserSummaryItem");
        const UserSummaryItem = WebpackModules.getByDisplayName("UserSummaryItem");
        const PartyMember = await ReactComponents.getComponentByName("PartyMember", selector);
        
        Patcher.before(VoiceUserSummaryItem.prototype, "render", _this => {
            if (_this.props.__patched) return;
            _this.props.__patched = true;

            const original = _this.props.renderUser;

            _this.props.renderUser = (props: any, ...args: any[]) => {
                const user: UserObject | void = props.user ?? props;
                const ret = original ? original.apply(null, [props].concat(args)) : null;
                if (!user) return ret;

                return (
                    <StatusAvatar
                        {...props}
                        user={user}
                        shouldWatch={false}
                        size={_this.props.size ?? StatusAvatar.Sizes.SIZE_16}
                        showTyping={{ id: "showChatTyping", value: true }}
                        radial={{ id: "chatRadialStatus", value: false }}
                        shouldShowUserPopout
                    />
                );
            };
        });

        Patcher.after(PartyMember.component.prototype, "render", (_this, _, ret) => {
            const { member: { user } } = _this.props;
            
            ret.props.children = (props: JSX.IntrinsicAttributes) => (
                <StatusAvatar
                    {...props}
                    user={user}
                    shouldWatch={false}
                    size={StatusAvatar.Sizes.SIZE_16}
                    showTyping={{id: "showChatTyping", value: true}}
                    radial={{ id: "chatRadialStatus", value: false }}
                    shouldShowUserPopout
                />
            );
        });

        Patcher.after(UserSummaryItem.prototype, "renderUsers", _this => {
            return _this.props.users.map((user: UserObject) => (
                <StatusAvatar
                    user={user}
                    className="avatarContainer-3CQrif"
                    type="voice-user"
                    size={StatusAvatar.Sizes.SIZE_24}
                    showTyping={{id: "showVoiceChatTyping", value: true}}
                />
            ));
        });

        PartyMember.forceUpdateAll();
    }

    private async patchPrivateChannel(): Promise<void> {
        const PrivateChannel = WebpackModules.getByDisplayName("PrivateChannel");

        Patcher.after(PrivateChannel.prototype, "renderAvatar", (_this, _, res) => {
            if (_this.props.pinned || _this.props.channel.type === ChannelTypes.GROUP_DM) return;

            return (
                <StatusAvatar
                    user={_this.props.user}
                    shouldWatch={false}
                    channel_id={_this.props.channel.id}
                    type="direct-message"
                    size={StatusAvatar.Sizes.SIZE_32}
                    showTyping={{ id: "showDirectMessagesTyping", value: true }}
                    radial={{ id: "directMessagesRadialStatus", value: false }}
                />
            );
        });
    }

    private async patchHeaderPlaying(): Promise<void> {
        const NowPlayingHeader = WebpackModules.getModule(m => m?.default?.displayName === "NowPlayingHeader");

        Patcher.after(NowPlayingHeader, "default", (_, __, res: any) => {
            const original = res.type;
            
            res.type = function ({ priorityUser: { user } }) {
                const ret = original.apply(this, arguments);
                
                try {
                    const avatar = Utilities.findInReactTree(ret, e => e?.props?.status);
                    if (!avatar) return ret;

                    avatar.props = Object.assign({}, {
                        user,
                        size: StatusAvatar.Sizes.SIZE_32,
                        shouldWatch: false,
                        channel_id: Channels.getDMFromUserId(user.id),
                        radial: {
                            id: "friendsPageRadialStatus",
                            value: false
                        },
                        showTyping: {
                            id: "showFriendsPageTyping",
                            value: true
                        },
                    });
                    avatar.type = StatusAvatar;
                } catch (error) {
                    Logger.error("Error in NowPlayHeader patch:\n", error);
                }
                
                return ret;
            }
        });
    }

    private async patchAvatar(): Promise<void> {
        const Avatars = WebpackModules.getModules(m => m?.type?.toString().includes("GuildIDContext"));

        for (const Avatar of Avatars) Patcher.after(Avatar, "type", (_, [props]) => {
            return (
                <StatusAvatar
                    {...props}
                    animated={props.src?.includes(".gif")}
                    shouldWatch={false}
                    channel_id={Channels.getDMFromUserId(props.user.id)}
                    showTyping={{ id: "showFriendsPageTyping", value: true }}
                    radial={{ id: "friendsPageRadialStatus", value: false }}
                />
            );
        });
    }

    private async patchUserProfile(): Promise<void> {
        const UserProfileModalHeader = WebpackModules.getModule(m => m?.default?.displayName === "UserProfileModalHeader");
        const classes = WebpackModules.getByProps("header", "headerTop");

        Patcher.after(UserProfileModalHeader, "default", (_, [props], res) => {
            const avatar = Utilities.findInReactTree(res, e => e?.props?.statusTooltip);
            if (!avatar) return;

            avatar.props = Object.assign({}, props, {
                size: StatusAvatar.Sizes.SIZE_120,
                className: classes.avatar,
                animated: true,
                shouldWatch: false,
                radial: {
                    id: "userProfileRadialStatus",
                    value: false
                },
                showTyping: {
                    id: "showUserProfileTyping",
                    value: true
                },
            });
            avatar.type = StatusAvatar;
        });
    }

    private async patchUserPopout(): Promise<void> {
        const UserPopoutComponents = WebpackModules.getByProps("UserPopoutAvatar");

        Patcher.after(UserPopoutComponents, "UserPopoutAvatar", (_, [props], res) => {
            const tree = Utilities.findInReactTree(res, e => e?.className?.includes("avatarWrapper"));
            if (!tree) return;
            const Component = tree.children[0].type;

            const WrappedAvatar = ({ className, ...props }) => (
                <Component className={joinClassNames(className, tree?.props?.className)} {...props} />
            );

            tree.children[0] = (
                <StatusAvatar
                    {...props}
                    shouldWatch={false}
                    type="user-popout"
                    animated
                    size={StatusAvatar.Sizes.SIZE_80}
                    AvatarComponent={WrappedAvatar}
                    radial={{ id: "userPopoutRadialStatus", value: false }}
                    showTyping={{ id: "showUserPopoutTyping", value: true }}
                />
            );
        });
    }

    private async patchMemberListItem(): Promise<void> {
        const MemberListItem = WebpackModules.getByDisplayName("MemberListItem");
        
        Patcher.after(MemberListItem.prototype, "renderAvatar", _this => {
            return (
                <StatusAvatar
                    {..._this.props}
                    type="member-list"
                    shouldWatch={false}
                    animated={_this.state?.hovered || _this.props.selected}
                    size={StatusAvatar.Sizes.SIZE_32}
                    showTyping={{id: "showMemberlistTyping", value: true}}
                    radial={{id: "memberlistRadialStatus", value: false}}
                />
            );
        });
    }

    private async patchChatAvatar(): Promise<void> {
        const ChatMessage = WebpackModules.getModule(m => m?.default?.toString?.().indexOf("ANIMATE_CHAT_AVATAR") > -1)

        type PatchArgs = {
            user: UserObject,
            subscribeToGroupId: string;
            message: any;
        };

        Patcher.after(ChatMessage, "default", (_, [props]: PatchArgs[], res) => {
            const tree = Utilities.findInReactTree(res, e => e?.renderPopout);
            const user = props?.message?.author;
            const channel_id = props?.message?.channel_id;
            if (!user || !tree?.children || tree.children.__patched || (user.bot && user.discriminator === "0000")) return;
            
            tree.children = () => (
                <StatusAvatar
                    {...props}
                    type="chat"
                    user={user}
                    channel_id={channel_id}
                    shouldShowUserPopout
                    showTyping={{id: "showChatTyping", value: true}}
                    radial={{id: "chatRadialStatus", value: false}}
                />
            );

            tree.children.__patched = true;
        });
    }

    private async patchChannelMessage(): Promise<void> {
        const ChannelMessage = WebpackModules.getModule(m => m.type.displayName === "ChannelMessage");

        Patcher.after(ChannelMessage, "type", function(_, __, res) {
            const tree = Utilities.findInReactTree(res, e => e?.childrenHeader);
            if (!tree) return;

            Patcher.after(tree.childrenHeader.type, "type", (_, [props], res) => {
                const user = props?.message?.author;
                const channel_id = props?.message?.channel_id;
                res.props.children[0] = (
                    <StatusAvatar
                        {...props}
                        type="chat"
                        user={user}
                        channel_id={channel_id}
                        shouldShowUserPopout
                        showTyping={{ id: "chatShowTyping", value: true }}
                        radial={{ id: "chatRadialStatus", value: false }}
                    />
                );
            });

            tree.childrenHeader.type.__patched_status_everywhere = true;

            this.unpatch();
        });
    }

    private async patchVoiceUser(): Promise<void> {
        const VoiceUser = WebpackModules.getByDisplayName("VoiceUser");
        const classes = WebpackModules.getByProps("avatarContainer", "avatarSmall");
        const classNames = ["avatarContainer", "avatarSmall", "avatar"].map(cl => classes[cl]).join(" ");

        type VoiceUserProps = {
            speaking: boolean;
            user: UserObject;
        };

        Patcher.after(VoiceUser.prototype, "renderAvatar", (_this: {props: VoiceUserProps}) => {
            return (
                <StatusAvatar
                    {..._this.props}
                    className={classNames}
                    isSpeaking={_this.props.speaking}
                    type="voice-user"
                    size={StatusAvatar.Sizes.SIZE_24}
                    showTyping={{id: "showVoiceChatTyping", value: true}}
                />
            );
        });
    }

    private async patchAuditlog(): Promise<void> {
        const AuditLog = WebpackModules.getByDisplayName("AuditLog");
        const classes = WebpackModules.getByProps("desaturate", "auditLog", "avatar");

        Patcher.after(AuditLog.prototype, "render", (_this, _, res) => {
            const originalChildren: Function | void = res?.props?.children;
            if (typeof originalChildren !== "function") return;
            if (!_this.props.log?.user) return;

            res.props.children = function () {
                const returnValue = originalChildren.apply(this, arguments);

                try {
                    const avatar = Utilities.findInReactTree(returnValue, e => e?.props?.className === classes.avatar);
                    if (!avatar || !avatar.type) return returnValue;

                    Object.assign(avatar.props, {
                        user: _this.props.log.user
                    });

                    avatar.type = (props: JSX.IntrinsicAttributes) => (
                        <StatusAvatar
                            {...props}
                            showTyping={{id: "showGuildSettingsShowTyping", value: true}}
                            radial={{id: "guildSettingsRadialStatus", value: false}}
                        />
                    );
                } catch (error) {
                    Logger.error("Failed to inject AuditLog item:\n", error);
                }

                return returnValue;
            }
        });
    }

    private async patchGuildSettingsMembers(): Promise<void> {
        const classes = WebpackModules.getByProps("member", "avatar");
        const Member = await ReactComponents.getComponentByName("Member", `.${classes.member}`);

        Patcher.after(Member.component.prototype, "render", (_this, _, returnValue) => {
            const avatar = Utilities.findInReactTree(returnValue, e => e?.props?.className === classes.avatar);
            if (!avatar || typeof avatar.type !== "function") return;
            
            Object.assign(avatar.props, {
                user: _this.props.user
            });

            avatar.type = (props: JSX.IntrinsicAttributes) => (
                <StatusAvatar
                    {...props}
                    showTyping={{id: "showGuildSettingsShowTyping", value: true}}
                    radial={{id: "guildSettingsRadialStatus", value: false}}
                />
            );
        });

        Member.forceUpdateAll();
    }

    onStop(): void {
        Patcher.unpatchAll();
        stylesheet.remove();
    }
}