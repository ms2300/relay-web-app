// vim: ts=4:sw=4:expandtab

(function () {
    'use strict';

    self.F = self.F || {};

    F.DefaultThreadView = F.View.extend({
        template: 'views/default-thread.html',
        className: 'thread default'
    });

    F.ThreadView = F.View.extend({

        id: function() {
            return `thread-${this.model.cid}`;
        },

        className: function() {
            return `thread ${this.model.get('type')}`;
        },

        render_attributes: async function() {
            return Object.assign({
                avatarProps: await this.model.getAvatar(),
                titleNormalized: this.model.getNormalizedTitle()
            }, F.View.prototype.render_attributes.apply(this, arguments));
        },

        render: async function() {
            if (this._rendered) {
                /* Too complicated to support rerender. Guard against it. */
                throw TypeError("Already Rendered");
            }
            await F.View.prototype.render.call(this);
            this.headerView = new F.ThreadHeaderView({
                el: this.$('.f-header'),
                model: this.model,
                threadView: this
            });
            this.asideView = new F.ThreadAsideView({
                el: this.$('aside'),
                model: this.model
            });
            await this.headerView.render();
            this.listenTo(this.model, 'remove', this.onRemove);
            if (this.model.get('asideExpanded')) {
                await this.toggleAside(null, /*skipSave*/ true);
            }
            return this;
        },

        toggleAside: async function(ev, skipSave) {
            const $aside = this.$('aside');
            const $icon = this.$('.f-toggle-aside i.f-toggle');
            const loading = 'icon loading notched circle';
            const expanded = !!$aside.hasClass('expanded');
            if (this._asideRenderTask) {
                clearInterval(this._asideRenderTask);
                this._asideRenderTask = null;
            }
            if (!expanded) {
                const iconsave = $icon.attr('class');
                $icon.attr('class', loading);
                try {
                    await this.asideView.render();
                } finally {
                    $icon.attr('class', iconsave);
                }
                this._asideRenderTask = setInterval(this.maybeRenderAside.bind(this), 5000);
            }
            $aside.toggleClass('expanded', !expanded);
            if (!skipSave) {
                await this.model.save({asideExpanded: !expanded});
            }
        },

        maybeRenderAside: async function() {
            if (!this.isHidden()) {
                await this.asideView.render();
            }
        },

        _dragEventHasFiles: function(ev) {
            return ev.originalEvent.dataTransfer.types.indexOf('Files') !== -1;
        },

        onRemove: function() {
            this.remove();
        },

        markRead: async function(ev) {
            await this.model.markRead();
        },

        isHidden: function() {
            return document.hidden || !(this.$el && this.$el.is(":visible"));
        }
    });

    F.ThreadAsideView = F.View.extend({
        template: 'views/thread-aside.html',

        events: {
            'click .f-notices .f-clear': 'onClearNotices',
            'click .f-notices .f-close': 'onCloseNotice'
        },

        initialize: function(options) {
            const rerenderEvents = [
                'change:title',
                'change:left',
                'change:pendingMembers',
                'change:distribution',
                'change:distributionPretty',
                'change:titleFallback',
                'change:notificationsMute',
                'change:notices'
            ];
            this.listenTo(this.model, rerenderEvents.join(' '), this.render);
        },

        render_attributes: async function() {
            const ids = await this.model.getMembers();
            const users = await F.atlas.getContacts(ids);
            const members = [];
            const notices = Array.from(this.model.get('notices') || []);
            for (const x of notices) {
                x.icon = x.icon || 'info circle';
                if (x.className === 'error') {
                    x.cornerIcon = 'red warning circle';
                } else if (x.className === 'warning') {
                    x.cornerIcon = 'yellow warning circle';
                } else if (x.className === 'success') {
                    x.cornerIcon = 'green thumbs up';
                }
            }
            for (const user of users) {
                const org = await user.getOrg();
                members.push(Object.assign({
                    id: user.id,
                    name: user.getName(),
                    orgAttrs: org.attributes,
                    avatar: await user.getAvatar(),
                    tagSlug: user.getTagSlug()
                }, user.attributes));
            }
            return Object.assign({
                members,
                age: Date.now() - this.model.get('started'),
                messageCount: await this.model.messages.totalCount(),
                titleNormalized: this.model.getNormalizedTitle(),
                hasNotices: !!notices.length,
                noticesReversed: notices.reverse(),
            }, F.View.prototype.render_attributes.apply(this, arguments));
        },

        onCloseNotice: async function(ev) {
            this.model.removeNotice(ev.currentTarget.dataset.id);
            await this.model.save();
        },

        onClearNotices: async function() {
            this.model.set('notices', []);
            await this.model.save();
        },
    });

    F.ThreadHeaderView = F.View.extend({
        template: 'views/thread-header.html',

        initialize: function(options) {
            this.threadView = options.threadView;
            const rerenderEvents = [
                'change:title',
                'change:left',
                'change:pendingMembers',
                'change:distribution',
                'change:distributionPretty',
                'change:titleFallback',
                'change:notices'
            ];
            this.listenTo(this.model, rerenderEvents.join(' '), this.render);
            this.listenTo(this.model, 'change:expiration', this.setExpireSelection);
            this.listenTo(this.model, 'change:notificationsMute', this.setNotificationsMute);
            this.listenTo(this.model, 'change:notices', this.render);
        },

        events: {
            'click .f-toggle-aside': 'onToggleAside',
            'click .f-update-thread': 'onUpdateThread',
            'click .f-archive-thread': 'onArchiveThread',
            'click .f-pin-thread' : 'onPinThread',
            'click .f-clear-messages': 'onClearMessages',
            'click .f-leave-thread': 'onLeaveThread',
            'click .f-reset-session': 'onResetSession',
        },

        onToggleAside: async function() {
            await this.threadView.toggleAside();
        },

        render_attributes: async function() {
            const notices = this.model.get('notices') || [];
            let noticeSeverityColor = 'blue';
            for (const x of notices) {
                if (x.className === 'error') {
                    noticeSeverityColor = 'red';
                    break;
                } else if (x.className === 'warning') {
                    noticeSeverityColor = 'yellow';
                }
            }
            return Object.assign({
                hasNotices: !!notices.length,
                noticeSeverityColor
            }, await this.threadView.render_attributes());
        },

        render: async function() {
            await F.View.prototype.render.call(this);
            this.$('.ui.dropdown').dropdown();
            this.$notificationsDropdown = this.$('.f-notifications.ui.dropdown').dropdown({
                onChange: this.onNotificationsSelection.bind(this)
            });
            this.$expireDropdown = this.$('.f-expire.ui.dropdown').dropdown({
                onChange: this.onExpireSelection.bind(this)
            });
            this.setExpireSelection();
            this.setNotificationsMute();
            return this;
        },

        setExpireSelection: function() {
            this.$expireDropdown.dropdown('set selected', String(this.getExpireTimer()));
        },

        setNotificationsMute: function() {
            const muted = this.model.notificationsMuted();
            const $el = this.$notificationsDropdown;
            const $icon = $el.find('i.icon');
            $icon.removeClass('mute');
            const $toggle = $el.find('[data-value="toggle"]');
            if (muted) {
                $icon.addClass('mute');
                $toggle.html('Enable Notifications');
                const expires = this.model.get('notificationsMute');
                if (typeof expires === 'number') {
                    setTimeout(this.setNotificationsMute.bind(this),
                               (expires - Date.now()) + 1000);
                }
            } else {
                $toggle.html('Disable Notifications');
            }
        },

        onExpireSelection: function(val) {
            const $icon = this.$expireDropdown.find('i.icon');
            val = Number(val);
            if (val) {
                $icon.removeClass('empty').addClass('full');
            } else {
                $icon.removeClass('full').addClass('empty');
            }
            if (val !== this.getExpireTimer()) {
                this.model.sendExpirationUpdate(val);
            }
        },

        onNotificationsSelection: async function(val) {
            let mute;
            if (val === 'toggle') {
                mute = !this.model.notificationsMuted();
            } else if (val) { // can be falsy during clear
                mute = Date.now() + (Number(val) * 1000);
            } else {
                return;
            }
            this.model.set('notificationsMute', mute);
            await this.model.save();
        },

        onResetSession: async function() {
            await this.model.endSession();
        },

        onLeaveThread: async function() {
            const confirm = await F.util.confirmModal({
                icon: 'eject',
                header: 'Leave Thread?',
                content: 'Please confirm that you want to leave this thread.'
            });
            if (confirm) {
                await this.model.leaveThread();
            }
        },

        onUpdateThread: function() {
            new F.ModalView({
                header: "Update Thread",
                content: 'Not Implemented'
            }).show();
        },

        onClearMessages: async function(ev) {
            const confirm = await F.util.confirmModal({
                icon: 'recycle',
                header: 'Clear Messages?',
                content: 'Please confirm that you want to delete your message ' +
                         'history for this thread.'
            });
            if (confirm) {
                await this.model.destroyMessages();
            }
        },

        onArchiveThread: async function(ev) {
            const confirm = await F.util.confirmModal({
                icon: 'archive',
                header: 'Archive Thread?',
                content: 'Please confirm that you want to archive this thread.'
            });
            if (confirm) {
                await this.model.archive();
                await F.mainView.openDefaultThread();
            }
        },

        onPinThread: async function(ev) {
            await this.model.save('pinned', true);
            await this.model.sendUpdate({pinned: true});
        },

        getExpireTimer: function() {
            return this.model.get('expiration') || 0;
        }
    });
})();
