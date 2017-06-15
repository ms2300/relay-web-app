/*
 * vim: ts=4:sw=4:expandtab
 */
(function () {
    'use strict';

    window.F = window.F || {};

    const ENTER_KEY = 13;
    const TAB_KEY = 9;
    const UP_KEY = 38;
    const DOWN_KEY = 40;

    /* Disable html entity conversion for code blocks */
    showdown.subParser('encodeCode', text => text);
    const mdConv = new showdown.Converter();
    mdConv.setFlavor('github');
    mdConv.setOption('noHeaderId', true);
    mdConv.setOption('ghMentionsLink', '/u/{u}');
    mdConv.setOption('openLinksInNewWindow', true);
    mdConv.setOption('tasklists', false);
    mdConv.setOption('tables', false);
    mdConv.setOption('requireSpaceBeforeHeadingText', false);

    F.ComposeView = F.View.extend({
        templateUrl: 'templates/article/compose.html',

        initialize: function(options) {
            this.sendHistory = [];
            this.sendHistoryOfft = 0;
            this.editing = false;
        },

        render: async function() {
            await F.View.prototype.render.call(this);
            this.fileInput = new F.FileInputView({
                el: this.$('.f-files')
            });
            this.$messageField = this.$('.f-message');
            this.$('.ui.dropdown').dropdown();
            return this;
        },

        events: {
            'input .f-message': 'onComposeInput',
            'keydown .f-message': 'onComposeKeyDown',
            'click .f-send': 'onSendClick',
            'click .f-attach': 'onAttachClick',
            'focus .f-message': 'messageFocus',
            'blur .f-message': 'messageBlur'
        },

        focusMessageField: function() {
            this.$messageField.focus();
        },

        messageFocus: function(e) {
            this.$('.f-input').addClass('focused');
        },

        messageBlur: function(e) {
            this.$('.f-input').removeClass('focused');
        },

        onSendClick: function(e) {
            this.send();
        },

        send: async function() {
            const raw = this.$messageField.html();
            const plain = this.replace_colons(this.$messageField.text().trim());
            const html = mdConv.makeHtml(this.replace_colons(raw));
            console.info('Sending Plain Message: %O', plain);
            console.info('Sending HTML Message: %O', html);
            if (plain.length + html.length > 0 || this.fileInput.hasFiles()) {
                this.trigger('send', plain, html, await this.fileInput.getFiles());
                this.fileInput.removeFiles();
                this.$messageField.html("");
                this.sendHistory.push(raw);
                this.sendHistoryOfft = 0;
                this.editing = false;
                this.focusMessageField();
            }
        },

        setLoading: function(loading) {
            const btn = this.$('.f-send');
            btn[`${loading ? 'add' : 'remove'}Class`]('loading circle notched');
        },

        onAttachClick: function(e) {
            this.fileInput.openFileChooser();
        },

        onComposeInput: function(e) {
            this.editing = true;
            const msgdiv = e.currentTarget;
            const dirty = msgdiv.innerHTML;
            const clean = F.util.htmlSanitize(dirty);
            if (clean !== dirty) {
                console.warn("Sanitizing input to:", clean);
                msgdiv.innerHTML = clean;
                this.selectEl(msgdiv, /*tail*/ true);
            }
            const emoji = this.replace_colons(clean);
            if (emoji !== clean) {
                msgdiv.innerHTML = emoji;
                this.selectEl(msgdiv, /*tail*/ true);
            }
        },

        selectEl: function(el, tail) {
            const range = document.createRange();
            range.selectNodeContents(el);
            if (tail) {
                range.collapse(false);
            }
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        },

        onComposeKeyDown: function(e) {
            const keyCode = e.which || e.keyCode;
            const msgdiv = e.currentTarget;
            if (!this.editing && this.sendHistory.length && (keyCode === UP_KEY || keyCode === DOWN_KEY)) {
                const offt = this.sendHistoryOfft + (keyCode === UP_KEY ? 1 : -1);
                this.sendHistoryOfft = Math.min(Math.max(0, offt), this.sendHistory.length);
                if (this.sendHistoryOfft === 0) {
                    msgdiv.innerHTML = '';
                } else {
                    msgdiv.innerHTML = this.sendHistory[this.sendHistory.length - this.sendHistoryOfft];
                    this.selectEl(msgdiv);
                }
                return false;
            } else if (keyCode === ENTER_KEY && !(e.altKey||e.shiftKey||e.ctrlKey)) {
                if (msgdiv.innerText.split(/```/g).length % 2) {
                    // Normal enter pressed and we are not in literal mode.
                    this.send();
                    return false; // prevent delegation
                }
            }
        },

        replace_colons: function(str) {
            return str.replace(emoji.rx_colons, function(m) {
                var idx = m.substr(1, m.length-2);
                var val = emoji.map.colons[idx];
                if (val) {
                    return emoji.data[val][0][0];
                } else {
                    return m;
                }
            });
        }
    });
})();
