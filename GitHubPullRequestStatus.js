/* global $, _ */
(function () {
    "use strict";
    angular.module('core', [])
        .factory("StatusOptions", function () {
            return {
                accept: 1,
                reject: 2,
                inProgress: 3
            };
        })
        .factory("sidebar", function ($q, $rootScope, $sce, $compile, $timeout, $interval) {
            function Sidebar() {
                this._scope = null;
                this._isOpen = false;
                this._animationDuration = 1000;
                this._getFilesInterval = null;
                this._scope = $rootScope.$new();
            }

            Sidebar.prototype.open = function (newFiles) {
                var self = this;
                if (newFiles) {
                    this._renderSidebar();
                    $timeout(function () { self.open(); }, 500);
                    return;
                }
                if (this._isOpen) { return; }
                this._isOpen = true;
                var $sidebar = $(".ghe__sidebar");
                var $footerContainer = $("body > .container");
                var $openCloseButton = $(".ghe__open-close-button");
                //The wide github chrome extension (https://chrome.google.com/webstore/detail/wide-github/kaalofacklcidaampbokdplbklpeldpj)
                //makes the footer too large by setting width: 90% !important.  Therefore, we set the footer container back to github's width.
                $footerContainer.attr("style", "width: 980px !important");
                var $wrapper = $("body > .wrapper");
                this._originalFooterMarginLeft = $footerContainer.css("marginLeft");
                var newFooterContainerMarginLeft = (window.innerWidth - $footerContainer.width() + 255 ) / 2;
                $openCloseButton.animate({ left: "-41px" }, {
                    duration: 500,
                    complete: function () {
                        $openCloseButton.removeClass("right").addClass("left");
                        $openCloseButton.animate({ left: "212px" }, { duration: self._animationDuration });
                        $wrapper.animate({ marginLeft: "255px" }, { duration: self._animationDuration });
                        $footerContainer.animate({ marginLeft: newFooterContainerMarginLeft.toString() + "px" }, { duration: self._animationDuration });
                        $sidebar.animate({ left: "0px" }, { duration: self._animationDuration });
                    }
                });
            };

            Sidebar.prototype.close = function (permanently) {
                var self = this;
                var deferred = $q.defer();
                $interval.cancel(this._getFilesInterval);
                var $openCloseButton = $(".ghe__open-close-button");
                if (!this._isOpen) {
                    if (permanently) {
                        $openCloseButton.animate({ left: "-41px" }, {
                            duration: 500,
                            complete: function () {
                                self._clearFiles();
                                deferred.resolve();
                            }
                        });
                    } else {
                        deferred.resolve();
                    }
                }
                this._isOpen = false;
                var $sidebar = $(".ghe__sidebar");
                var $footerContainer = $("body > .container");
                //The wide github chrome extension (https://chrome.google.com/webstore/detail/wide-github/kaalofacklcidaampbokdplbklpeldpj)
                //makes the footer too large by setting width: 90% !important.  Therefore, we set the footer container back to github's original width.
                var $wrapper = $("body > .wrapper");
                $wrapper.animate({ marginLeft: "0px" }, { duration: this._animationDuration });
                $footerContainer.animate({ marginLeft: self._originalFooterMarginLeft }, { duration: this._animationDuration });
                $sidebar.animate({ left: "-254px" }, { duration: this._animationDuration });
                $openCloseButton.animate({ left: "-41px" }, {
                    duration: this._animationDuration,
                    complete: function () {
                        $openCloseButton.removeClass("left").addClass("right");
                        if (!permanently) {
                            $openCloseButton.animate({left: "10px"}, {
                                duration: 500,
                                complete: function () { deferred.resolve(); }
                            });
                        } else {
                            self._clearFiles();
                            deferred.resolve();
                        }
                    }
                });
                return deferred.promise;
            };

            Sidebar.prototype._clearFiles = function () {
                this._scope.files = [];
            };

            Sidebar.prototype._renderSidebar = function () {
                var self = this;
                var $pullRequestFilesLink = $("[data-container-id='files_bucket']");
                var $gheSidebar = $(".ghe__sidebar");
                this._scope.files = this._getFiles();
                if (!this._scope.files.length) {
                    $pullRequestFilesLink.on("click.loadingFiles", function () {
                        self._getFilesInterval = $interval(function () {
                            self._scope.files = self._getFiles();
                            if (self._scope.files.length) {
                                $interval.cancel(self._getFilesInterval);
                            }
                        }, 1000);
                    });
                }
                if ($gheSidebar.length) {
                    return;
                }
                var self = this;
                var sidebar =
                    "<div class='ghe__sidebar'>" +
                    "    <div class='ghe__chevron ghe__open-close-button' ng-click='toggleSidebar()'></div>" +
                    "    <div class='ghe__sidebar-header'>" +
                    "        <div class='ghe__title'>Pull Request Manager</div>" +
                    "    </div>" +
                    "    <div class='ghe__sidebar-files-wrapper'>" +
                    "        <div class='ghe__sidebar-files'>" +
                    "            <div ng-repeat='file in files' class='ghe__file-wrapper'>" +
                    "                <div class='ghe__file-icon' ng-bind-html='file.icon'></div>" +
                    "                <a class='ghe__file-link' ng-click='openFile(file.href)'>{{file.name}}</a><a class='ghe__comment-link' ng-click='toggleComments(file)'><span class='octicon octicon-comment'>{{file.numComments}}</span></a>" +
                    "            </div>" +
                    "            <div class='ghe__files-not-loaded-message' ng-if='files.length === 0'>Your files are not loaded.  They will load when you click on the \"Files Changed\" link.</div>" +
                    "        </div>" +
                    "    </div>" +
                    "</div>";
                this._scope.toggleSidebar = function () {
                    if (self._isOpen) {
                        self.close();
                    } else {
                        self.open();
                    }
                };
                this._scope.toggleComments = function (file) {
                    file.$toggleCommentsCheckbox[0].click();
                };
                this._scope.openFile = function(href) {
                    if (window.location.pathname.indexOf("files") === -1) {
                        if ($pullRequestFilesLink.length) {
                            $pullRequestFilesLink[0].click();
                        }
                    }
                    window.location.hash = href;
                };
                var $sidebar = $compile(sidebar)(this._scope);
                var $body = $("body");
                $body.prepend($sidebar);
            };

            Sidebar.prototype._getFiles = function () {
                var files = $(".table-of-contents li a:not(.tooltipped)").map(function (i, e) {
                    var $e = $(e);
                    var $diffIcon = $e.siblings(".octicon").clone();
                    var icon = $sce.trustAsHtml($diffIcon[0].outerHTML);
                    var fullPath = $e.text().trim();
                    return { name: _.last(fullPath.split("/")), href: $e.attr("href"), icon: icon };
                });
                var fileCommentInfos = $(".file.js-details-container").map(function (i, e) {
                    var $e = $(e);
                    return { $toggleCommentsCheckbox: $e.find(".js-toggle-file-notes"), numComments: $e.find("[data-body-version]").length };
                });
                _.each(files, function (file, i) {
                    var fileCommentInfo = fileCommentInfos[i];
                    _.extend(file, fileCommentInfo);
                });
                return files;
            };

            return new Sidebar();
        })
        .factory("StatusesManager", function (StatusOptions, $q, ghHttp) {
            function StatusesManager(config) {
                this._statuses = {};
                this._userId = config.userId;
            }

            StatusesManager.prototype.getFromServer = function (repoId, pullRequestIds) {
                var self = this;
                return this._getRepos().then(function (repos) {
                    var repo = _.find(repos, function (r) { return r.id === repoId; });
                    if (!repo) { return; }

                    var issueCommentsPromises = _.reduce(pullRequestIds, function (seed, pullRequestId) {
                        seed[pullRequestId] = ghHttp.get(repo.issues_url.replace("{/number}", "/" + pullRequestId + "/comments"));
                        return seed;
                    }, {});
                    var pullRequestCommentsPromises = _.reduce(pullRequestIds, function (seed, pullRequestId) {
                        seed[pullRequestId] = ghHttp.get(repo.pulls_url.replace("{/number}", "/" + pullRequestId + "/comments"));
                        return seed;
                    }, {});
                    var pullRequestCommitsPromises = _.reduce(pullRequestIds, function (seed, pullRequestId) {
                        seed[pullRequestId] = ghHttp.get(repo.pulls_url.replace("{/number}", "/" + pullRequestId ));
                        return seed;
                    }, {});

                    var issueCommentsPromise = $q.all(issueCommentsPromises).then(function (issueComments) { return issueComments; });
                    var pullRequestCommentsPromise = $q.all(pullRequestCommentsPromises).then(function (pullRequestsComments) { return pullRequestsComments; });
                    var commitsPromise = $q.all(pullRequestCommitsPromises).then(function (pullRequestsCommits) { return pullRequestsCommits; });

                    return $q.all({ issueComments: issueCommentsPromise, pullRequestComments: pullRequestCommentsPromise, commits: commitsPromise })
                        .then(function (commentsAndCommits) {
                            _.each(commentsAndCommits.issueComments, function (comments, pullRequestId) {
                                var mostRecentComment = _.max(commentsAndCommits.pullRequestComments[pullRequestId].concat(comments), function (c) { return new Date(c.updated_at); });
                                self._statuses[pullRequestId] = { users: {}, mostRecentCommentDatetime: mostRecentComment ? new Date(mostRecentComment.updated_at) : null };
                                _.each(comments, function (comment) {
                                    var status = self._parseComment(comment);
                                    if (status) {
                                        self._statuses[pullRequestId].users[comment.user.id] = status;
                                    }
                                });
                                var commits = commentsAndCommits.commits[pullRequestId].commits;
                                self._setInProgressInfo(self._statuses[pullRequestId], repoId, pullRequestId, self._userId, commits);
                            });
                            return self._statuses;
                        });
                });
            };

            StatusesManager.prototype.markPullRequestCommits = function(repoId, pullRequestId, commits) {
                localStorage.setItem("githubenhancements_pullRequestCommits_" + repoId.toString() + "_" + pullRequestId.toString(), JSON.stringify(commits));
            };

            StatusesManager.prototype.getPullRequestCommits = function (repoId, pullRequestId) {
                return localStorage.getItem("githubenhancements_pullRequestCommits_" + repoId.toString() + "_" + pullRequestId.toString());
            };

            StatusesManager.prototype.markCommitPullRequests = function(repoId, commitHash, pullRequestIds) {
                localStorage.setItem("githubenhancements_commitPullRequests_" + repoId.toString() + "_" + commitHash, JSON.stringify(pullRequestIds));
            };

            StatusesManager.prototype.getCommitPullRequests = function (repoId, commitHash) {
                return localStorage.getItem("githubenhancements_commitPullRequests_" + repoId.toString() + "_" + commitHash);
            };

            StatusesManager.prototype.getReadCommentsOnPullRequest = function (repoId, pullRequestId, includeCommitComments) {
                var self = this;
                var readCommentsJSON = localStorage.getItem("githubenhancements_pullRequestsReadComments_" + repoId.toString() + "_" + pullRequestId.toString());
                var pullRequestComments = JSON.parse(readCommentsJSON || "[]");
                if (!includeCommitComments) {
                    return pullRequestComments;
                }
                var commits = this.getPullRequestCommits(repoId, pullRequestId);
                var commitComments = _.flatten(commits, function (commitHash) { return self.getReadCommentsOnCommit(repoId, commitHash); });
                return pullRequestComments.concat(commitComments);
            };

            StatusesManager.prototype.getReadCommentsOnCommit = function (repoId, commitHash, includeAllPullRequestComments) {
                var self = this;
                var readCommentsJSON = localStorage.getItem("githubenhancements_commitReadComments_" + repoId.toString() + "_" + commitHash.toString());
                var commitComments = JSON.parse(readCommentsJSON || "[]");
                if (!includeAllPullRequestComments) {
                    return commitComments;
                }
                var pullRequestIds = this.getCommitPullRequests(repoId, commitHash);
                var pullRequestComments = _.flatten(pullRequestIds, function (pullRequestId) { return self.getReadCommentsOnPullRequest(repoId, pullRequestId); });
                return _.uniq(commitComments.concat(pullRequestComments));
            };

            StatusesManager.prototype.addReadComment = function (repoId, pullRequestId, comment) {
                var readComments = this.getReadCommentsOnPullRequest(repoId, pullRequestId);
                readComments.push(comment);
                localStorage.setItem("githubenhancements_pullRequestsReadComments_" + repoId.toString() + "_" + pullRequestId.toString(), JSON.stringify(readComments));
            };

            StatusesManager.prototype.addReadCommentOnCommit = function (repoId, commitHash, comment) {
                var readComments = this.getReadCommentsOnCommit(repoId, commitHash);
                readComments.push(comment);
                localStorage.setItem("githubenhancements_commitReadComments_" + repoId.toString() + "_" + commitHash.toString(), JSON.stringify(readComments));
            };

            StatusesManager.prototype.markPullRequestOpened = function (repoId, pullRequestId) {
                var utcDateTime = new Date().toUTCString();
                localStorage.setItem("githubenhancements_pullRequestsOpened_" + repoId.toString() + "_" + pullRequestId.toString(), utcDateTime);
            };

            StatusesManager.prototype.getPullRequestLastOpened = function (repoId, pullRequestId) {
                var lastOpenedDateString = localStorage.getItem("githubenhancements_pullRequestsOpened_" + repoId.toString() + "_" + pullRequestId.toString());
                return lastOpenedDateString ? new Date(lastOpenedDateString) : null;
            };

            StatusesManager.prototype._getRepos = function () {
                var self = this;
                if (this._repos) {
                    return $q.when(this._repos);
                }
                return ghHttp.get("user/repos").then(function (repos) { self._repos = repos; return repos; });
            };

            StatusesManager.prototype._setInProgressInfo = function (statuses, repoId, pullRequestId, userId, commits) {
                var seenCommits = localStorage.getItem("githubenhancements_pullRequestCommits_" + repoId.toString() + "_" + pullRequestId.toString());
                if (!statuses.users[userId] && seenCommits) {
                    statuses.users[userId] = StatusOptions.inProgress;
                }
                if (seenCommits) {
                    statuses.newCommits = commits > JSON.parse(seenCommits).length;
                }
            };

            StatusesManager.prototype._parseComment = function (comment) {
                var message = comment.body.trim();
                if (message === ":+1:") {
                    return StatusOptions.accept;
                }
                if (message === ":-1:") {
                    return StatusOptions.reject;
                }
                return null;
            };

            return StatusesManager;

        })
        .factory("ListManager", function (StatusOptions) {
            function ListManager(config) {
                this._userId = config.userId;
                this._userName = config.userName;
                this._repoId = config.repoId;
                this._statusesManager = config.statusesManager;
                this._lastCheck = null;
                this._pullRequestIdsToDecorate = [];
                this.startPolling();
            }

            ListManager.prototype.startPolling = function () {
                var self = this;
                this._checkPullRequests();
                setInterval(function () { self._checkPullRequests(); }, 1000);
            };

            ListManager.prototype._checkPullRequests = function () {
                var pullRequestListItems = this._getPullRequestListItems();
                var pullRequestIds = this._getPullRequestIds(pullRequestListItems);
                if (pullRequestListItems.length > 0) {
                    if (this._checkedLongTimeAgo() && !this._arePullRequestIdsEqual(this._pullRequestIdsToDecorate, pullRequestIds)) {
                        this._lastCheck = Date.now();
                        this._decoratePullRequests(pullRequestListItems, pullRequestIds);
                    }
                    else {
                        var newPullRequestListItems = this._filterToNewPullRequests(pullRequestListItems);
                        var newPullRequestIds = this._getPullRequestIds(newPullRequestListItems);
                        if (newPullRequestListItems.length && !this._arePullRequestIdsEqual(this._pullRequestIdsToDecorate, newPullRequestIds)) {
                            this._decoratePullRequests(newPullRequestListItems, newPullRequestIds);
                        }
                    }
                }
            };

            ListManager.prototype._arePullRequestIdsEqual = function (pullRequestIdsOne, pullRequestIdsTwo) {
                var sortedPullRequestIdsOne = _.sortBy(pullRequestIdsOne);
                var sortedPullRequestIdsTwo = _.sortBy(pullRequestIdsTwo);
                var zippedIds = _.zip(sortedPullRequestIdsOne, sortedPullRequestIdsTwo);
                return _.all(zippedIds, function (ids) { return ids[0] === ids[1]; });
            };

            ListManager.prototype._getPullRequestListItems = function () {
                return $(".issues-listing .table-list [data-issue-id]")
                    .filter(function (i, e) {
                        return $(e).find(".octicon-git-pull-request").length;
                    });
            };

            ListManager.prototype._filterToNewPullRequests = function (pullRequestListItems) {
                return pullRequestListItems.filter(function (i, e) { return $(e).find(".enhancements-pull-request-meta-info-container").length === 0; });
            };

            ListManager.prototype._getPullRequestIds = function (pullRequestListItems) {
                return pullRequestListItems.map(function(i, e) { return parseInt($(e).attr("data-issue-id"), 10); });
            };

            ListManager.prototype._checkedLongTimeAgo = function () {
                var lastCheckThreshold = 120 * 1000;
                return Date.now() - this._lastCheck > lastCheckThreshold;
            };

            ListManager.prototype._decoratePullRequests = function (pullRequestListItems) {
                var self = this;
                var pullRequestIds = this._getPullRequestIds(pullRequestListItems);
                this._pullRequestIdsToDecorate = pullRequestIds;
                return this._statusesManager.getFromServer(this._repoId, pullRequestIds)
                    .then(function (statuses) {
                        if (!self._arePullRequestIdsEqual(self._pullRequestIdsToDecorate, pullRequestIds)) { return; }
                        self._getPullRequestListItems()
                            .each(function (i, element) {
                                var $element = $(element);
                                var pullRequestId = parseInt($element.attr("data-issue-id"), 10);
                                var pullRequestInfo = statuses[pullRequestId];
                                if (!pullRequestInfo) { return; }
                                self._renderListItemBackground($element, pullRequestInfo.users[self._userId]);
                                self._renderListItemMetaInfo($element, pullRequestInfo, pullRequestId);
                            });
                    })
                    .finally(function () { self._pullRequestIdsToDecorate = []; });
            };

            ListManager.prototype._renderListItemBackground = function (element, status) {
                var pullRequestAuthorUserName = element.find(".opened-by .muted-link").text().trim();
                if (pullRequestAuthorUserName === this._userName) {
                    //element.css("background-color", "rgba(65, 131, 196, 0.2)");
                }
                else if (status === StatusOptions.accept) {
                    element.css("background-color", "rgba(0, 157, 89, 0.2)");
                }
                else if (status === StatusOptions.reject) {
                    element.css("background-color", "rgba(206, 60, 40, 0.2)");
                }
                else if (status === StatusOptions.inProgress) {
                    element.css("background-color", "rgba(255, 239, 198, 0.4)");
                }
                else {
                    element.css("background-color", "");
                }
            };

            ListManager.prototype._renderListItemMetaInfo = function ($element, pullRequestInfo, pullRequestId) {
                var accepts = _.filter(pullRequestInfo.users, function (val) { return val === StatusOptions.accept; }).length.toString();
                var rejects = _.filter(pullRequestInfo.users, function (val) { return val === StatusOptions.reject; }).length.toString();
                var mostRecentCommentDatetime = pullRequestInfo.mostRecentCommentDatetime;
                var lastOpenedDatetime = this._statusesManager.getPullRequestLastOpened(this._repoId, pullRequestId);
                if ($element.find(".issue-meta .enhancements-pull-request-meta-info-container").length === 0) {
                    $element.find(".issue-meta").append("<span class='enhancements-pull-request-meta-info-container'></span>");
                }
                $element
                    .find(".issue-meta .enhancements-pull-request-meta-info-container")
                    .html("")
                    .append(accepts + ' <img class="emoji" title=":+1:" alt=":+1:" src="https://assets-cdn.github.com/images/icons/emoji/unicode/1f44d.png" height="15" width="15" align="absmiddle">')
                    .append(rejects + ' <img class="emoji" title=":-1:" alt=":-1:" src="https://assets-cdn.github.com/images/icons/emoji/unicode/1f44e.png" height="15" width="15" align="absmiddle">');
                if (pullRequestInfo.newCommits) {
                    $element
                        .find(".issue-meta .enhancements-pull-request-meta-info-container")
                        .append("<span>&nbsp;&nbsp; NEW COMMITS</span>");
                }
                if (mostRecentCommentDatetime > lastOpenedDatetime) {
                    $element
                      .find(".issue-meta .enhancements-pull-request-meta-info-container")
                      .append("<span>&nbsp;&nbsp; NEW COMMENTS</span>");
                }
            };

            return ListManager;
        })
        .factory("CommentsManager", function ($timeout, $interval) {
            function CommentsManager(config) {
                this._callbacks = {
                    onRead: config.onRead,
                    getReadComments: config.getReadComments
                };
                this._diffId = null;
                this._userName = config.userName;
                this._interval = null;
            }

            CommentsManager.prototype.start = function (diffId) {
                var self = this;
                this._cleanup();
                this._diffId = diffId;
                $("[data-body-version]").on("click", function (e) {
                    var commentId = $(e.currentTarget).attr("data-body-version");
                    self._onRead(commentId);
                    self._sync();
                });
                self._sync();
                this._interval = $interval(function () {
                    self._sync();
                }, 1000);
            };

            CommentsManager.prototype.stop = function () {
                this._cleanup();
            };

            CommentsManager.prototype._cleanup = function () {
                this._diffId = null;
                $("[data-body-version]").off("click");
                $interval.cancel(this._interval);
            };

            CommentsManager.prototype._sync = function () {
                var self = this;
                var readComments = this._getReadComments();
                $("[data-body-version]").each(function (i, e) {
                    var $e = $(e);
                    if ($e.css("display") === "none") { return; }
                    if (self._getCommentUserName($e) === self._userName) { return; }
                    var dataBodyVersion = $e.attr("data-body-version");
                    $e.find(".unread-label").remove();
                    if (readComments.indexOf(dataBodyVersion) === -1) {
                        $e.find(".timeline-comment-header-text").append("<span class='unread-label'>&nbsp;&nbsp; UNREAD</span>");
                        $e.find(".timeline-comment-header").css("background-color", "rgba(255, 239, 198, 0.4)");
                        self._markReadIfAppropriate($e, dataBodyVersion);
                    }
                    else {
                        $e.find(".timeline-comment-header").css("background-color", "");
                    }
                });
            };

            CommentsManager.prototype._markReadIfAppropriate = function ($element, commentId) {
                var self = this;
                if ($element.visible()) {
                    $timeout(function () {
                        if ($element.visible()) {
                            self._onRead(commentId);
                            self._sync();
                        }
                    }, 2000);
                }
            };

            CommentsManager.prototype._getCommentUserName = function ($element) {
                return $element.find(".author").text();
            };

            CommentsManager.prototype._onRead = function (commentId) {
                this._callbacks.onRead(this._diffId, commentId);
            };

            CommentsManager.prototype._getReadComments = function () {
                return this._callbacks.getReadComments(this._diffId);
            };

            return CommentsManager;
        })
        .factory("DiffManager", function ($timeout, $interval, sidebar) {
            function DiffManager(config) {
                this._repoId = config.repoId;
                this._userId = config.userId;
                this._userName = config.userName;
                this._commentsManager = config.commentsManager;
                this._callbacks = {
                    isOpen: config.isOpen,
                    onOpen: config.onOpen,
                    getDiffId: config.getDiffId
                };
                this._diffId = null;
                this._clean = true;
                this._init();
            }

            DiffManager.prototype._init = function () {
                var self = this;
                this._sync();
                $interval(function () { self._sync(); }, 1000);
            };

            DiffManager.prototype._sync = function () {
                if (!this._isOpen()) {
                    this._tearDown();
                    return;
                }
                this._clean = false;
                var diffId = this._getDiffId();
                if (this._diffId !== diffId) {
                    this._setup(diffId);
                }
            };

            DiffManager.prototype._setup = function (diffId) {
                this._diffId = diffId;
                this._onOpen();
                this._commentsManager.start(diffId);
                sidebar.open(/*newFiles*/true);
            };

            DiffManager.prototype._tearDown = function () {
                if (this._clean) { return; }
                this._diffId = null;
                this._commentsManager.stop();
                sidebar.close(/*permanently*/true);
                this._clean = true;
            };

            DiffManager.prototype._getDiffId = function () {
                return this._callbacks.getDiffId();
            };

            DiffManager.prototype._isOpen = function () {
                return this._callbacks.isOpen();
            };

            DiffManager.prototype._onOpen = function () {
                this._callbacks.onOpen(this._diffId);
            };

            return DiffManager;
        })
        .factory("pullRequestManager", function (CommentsManager, DiffManager) {
            var create = function(config) {
                var commentsManager = new CommentsManager({
                  userName: config.userName,
                  onRead: function (diffId, commentId) {
                      config.statusesManager.addReadComment(config.repoId, diffId, commentId);
                  },
                  getReadComments: function (diffId) {
                      return config.statusesManager.getReadCommentsOnPullRequest(config.repoId, diffId, /*includeCommitComments*/true);
                  }
                });
                new DiffManager({
                    repoId: config.repoId,
                    userId: config.userId,
                    userName: config.userName,
                    commentsManager: commentsManager,
                    isOpen: function () {
                        return $(".view-pull-request").length !== 0;
                    },
                    onOpen: function (diffId) {
                        config.statusesManager.markPullRequestOpened(config.repoId, diffId);
                        var commits = $(".commit-links-group [data-clipboard-text]")
                            .map(function (i, e) { return $(e).attr("data-clipboard-text"); })
                            .toArray();
                        config.statusesManager.markPullRequestCommits(config.repoId, diffId, commits);
                    },
                    getDiffId: function () {
                        return parseInt($(".gh-header-number").text().substring(1), 10);
                    }
                });
            };

            return { create: create };
        })
        .factory("commitManager", function (CommentsManager, DiffManager) {
            var create = function(config) {
                var commentsManager = new CommentsManager({
                    userName: config.userName,
                    onRead: function (diffId, commentId) {
                        config.statusesManager.addReadCommentOnCommit(config.repoId, diffId, commentId);
                    },
                    getReadComments: function (diffId) {
                        return config.statusesManager.getReadCommentsOnCommit(config.repoId, diffId, /*includeCommitComment*/true);
                    }
                });
                new DiffManager({
                    repoId: config.repoId,
                    userId: config.userId,
                    userName: config.userName,
                    commentsManager: commentsManager,
                    isOpen: function () {
                        return $(".full-commit").length !== 0;
                    },
                    onOpen: function (diffId) {
                        var pullRequestIds = $(".pull-request a")
                            .map(function (i, e) {
                                var $e = $(e);
                                var pullRequestId = $e.text().replace("#", "");
                                return parseInt(pullRequestId, 10);
                            })
                            .toArray();
                        config.statusesManager.markCommitPullRequests(config.repoId, diffId, pullRequestIds);
                    },
                    getDiffId: function () {
                        return $(".full-commit span.js-selectable-text").text();
                    }
                });
            };

            return { create: create };
        })
        .factory("parseQueryString", function () {
            return function () {
                // This function is anonymous, is executed immediately and
                // the return value is assigned to QueryString!
                var query_string = {};
                var query = window.location.search.substring(1);
                var vars = query.split("&");
                for (var i=0;i<vars.length;i++) {
                    var pair = vars[i].split("=");
                    // If first entry with this name
                    if (typeof query_string[pair[0]] === "undefined") {
                        query_string[pair[0]] = pair[1];
                        // If second entry with this name
                    } else if (typeof query_string[pair[0]] === "string") {
                        var arr = [ query_string[pair[0]], pair[1] ];
                        query_string[pair[0]] = arr;
                        // If third or later entry with this name
                    } else {
                        query_string[pair[0]].push(pair[1]);
                    }
                }
                return query_string;
            };
        })
        .factory("ghHttp", function ($http, parseQueryString, $q) {
            function GHHttp() {
                this._failedToGetAccessToken = false;
            }

            GHHttp.prototype.get = function (url, config) {
                var self = this;
                return this.getAccessToken()
                    .then(function (accessToken) {
                        config = config || {};
                        config.headers = {
                            Authorization: "token " + accessToken,
                            Accept: "application/vnd.github.moondragon-preview+json"
                        };
                        if (url.indexOf("https://api.github.com/") === -1) {
                            url = "https://api.github.com/" + url;
                        }
                        return $http.get(url, config)
                            .then(function (obj) { return obj.data; })
                            .catch(function (error) {
                                if (error.status === 401) {
                                    self._setAccessToken("");
                                    self.getAccessToken();
                                }
                                return $q.reject(error);
                            });
                    });
            };

            GHHttp.prototype.getAccessToken = function() {
                var self = this;
                var queryString = parseQueryString();
                var accessToken = localStorage.getItem("githubenhancements_accessToken");
                if (accessToken) {
                    return $q.when(accessToken);
                }
                else if (this._failedToGetAccessToken) {
                    return $q.reject("failedToGetAccessToken");
                }
                else if (queryString.code)  {
                    return $http.post("https://www.platform.githubenhancements.com/enhancements/requestAccessToken?code=" + queryString.code)
                        .then(function (response) {
                            if (!response.data.access_token) { return $q.reject("failedToGetAccessToken"); }
                            self._setAccessToken(response.data.access_token);
                            return localStorage.getItem("githubenhancements_accessToken");
                        })
                        .catch(function () {
                            self._failedToGetAccessToken = true;
                            return $q.reject("failedToGetAccessToken");
                        });
                }
                else if (window.location.pathname === "/login/oauth/authorize") {
                    return $q.defer().promise;
                }
                else {
                    window.location = "https://github.com/login/oauth/authorize?client_id=1caf3bea91f7c15f11ca&scope=repo,read:org&redirect_uri=" + encodeURIComponent(window.location);
                    return $q.defer().promise;
                }
            };

            GHHttp.prototype._setAccessToken = function (value) {
                localStorage.setItem("githubenhancements_accessToken", value);
            };

            return new GHHttp();
        })
        .factory("main", function (ListManager, pullRequestManager, ghHttp, StatusesManager, commitManager) {
            var run = function () {
                var repoId = parseInt($("#repository_id").val(), 10);
                var userId = parseInt($(".header-nav-link [data-user]").attr("data-user"), 10);
                var userName = $("[name='octolytics-actor-login']").attr("content");
                if (!repoId) { return; }
                var statusesManager = new StatusesManager({ userId: userId });
                var listManager = new ListManager({ userId: userId, userName: userName, repoId: repoId, statusesManager: statusesManager });
                pullRequestManager.create({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
                commitManager.create({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
                window.destroyGithubEnhancementsStorage = function () {
                    var keyStart = "githubenhancements";
                    _(localStorage)
                        .keys()
                        .filter(function (k) { return k.slice(0, keyStart.length) === keyStart; } )
                        .each(function (k) { localStorage.removeItem(k); });
                };
            };
            return { run: run };
        });
    angular.injector(['ng', 'core']).invoke(function (main) { main.run(); });
})();

