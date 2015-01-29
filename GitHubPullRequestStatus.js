/* global $, _ */
(function () {
    "use strict";
    angular.module('core', [])
        .factory("StatusOptions", function () {
            return {
                accept: 1,
                reject: 2,
                inProgress: 3
            }
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
                setInterval(function () { self._checkPullRequests() }, 1000);
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
        .factory("PullRequestManager", function ($compile, $timeout) {
            function PullRequestManager(config) {
                this._repoId = config.repoId;
                this._userId = config.userId;
                this._userName = config.userName;
                this._statusesManager = config.statusesManager;
                this._commentsClickListener = { pullRequestId: null };
                this._currentPullRequestId = null;
                this._startPolling();
            }

            PullRequestManager.prototype._startPolling = function() {
                var self = this;
                this._syncPullRequest();
                setInterval(function () { self._syncPullRequest(); }, 1000);
            };

            PullRequestManager.prototype._isPullRequestOpen = function () {
                return $(".view-pull-request").length !== 0;
            };

            PullRequestManager.prototype._getPullRequestId = function () {
                return parseInt($(".gh-header-number").text().substring(1), 10);
            };

            PullRequestManager.prototype._getCommits = function () {
                return $(".commit-links-group [data-clipboard-text]")
                    .map(function (i, e) { return $(e).attr("data-clipboard-text"); })
                    .toArray();
            };

            PullRequestManager.prototype._syncPullRequest = function () {
                if (!this._isPullRequestOpen()) {
                    this._deregisterCommentsClickListener();
                    return;
                }
                var pullRequestId = this._getPullRequestId();
                if (this._currentPullRequestId !== pullRequestId) {
                    this._markPullRequestOpened(pullRequestId);
                    this._markPullRequestCommits(pullRequestId);
                    this._registerCommentsClickListener(pullRequestId);
                    this._setupPullRequest(pullRequestId);
                }
                this._syncComments(pullRequestId);
            };

            PullRequestManager.prototype._setupPullRequest = function(pullRequestId) {
                this._renderFilesContainer();
                this._renderFileNames();
            };

            PullRequestManager.prototype._renderFileNames = function () {
                var fileNames = this._getFileNames();
                var fileNamesContainer = $(".file-names-container");
                fileNamesContainer.html("");
                _.each(fileNames, function (name) {
                    fileNamesContainer.append("<span>" + name + "</span>");
                });
            };

            PullRequestManager.prototype._renderFilesContainer = function () {
                var css = document.createElement("style");
                css.type = "text/css";
                css.innerHTML =
                    ".ghe__sidebar {" +
                    "    position: absolute;" +
                    "    width: 0px;" +
                    "    background-color: rgb(247, 247, 247); border-right: 1px solid rgb(221, 221, 221);" +
                    "    z-index: 1;" +
                    "}" +
                    ".ghe__sidebar-header {" +
                    "    background-color: rgb(243, 243, 243);" +
                    "    background-image: linear-gradient(rgb(249, 249, 249), rgb(243, 243, 243));" +
                    "    background-repeat: repeat-x;" +
                    "    height: 49px;" +
                    "    border-bottom: 1px solid rgb(229, 229, 229);" +
                    "}" +
                    ".ghe__files {" +
                    "    display: flex;" +
                    "}" +
                    ".ghe__file-icon {" +
                    "    width: 17px;" +
                    "    margin-right: 2px;" +
                    "    margin-left: 10px;" +
                    "    color: #777;" +
                    "}";
                document.body.appendChild(css);

                var sidebar =
                    "<div class='ghe__sidebar'>" +
                    "    <div class='ghe__sidebar-header'>" +
                    "        <div class='ghe__sidebar-files'>" +
                    "        </div>" +
                    "    </div>" +
                    "</div>";
                var $sidebar = $compile(sidebar)({});
                var $container = $(".container");
                var $body = $("body");
                var containerNewMarginLeft = parseInt($container.css("margin-left"), 10) + (255 / 2);
                $sidebar.height($body.height());
                $body.prepend($sidebar);
                $timeout(function () {
                    //$wrapper.animate({ paddingLeft: "255px"/*, width: newWrapperWidth.toString() + "px"*/ }, { duration: 2000 });
                    $container.animate({ marginLeft: containerNewMarginLeft.toString() + "px" }, { duration: 2000 });
                    $sidebar.animate({ width: "254px" }, {
                        complete: function () {
                            $sidebar.height($body.height());
                        },
                        duration: 2000
                    });
                }, 1000);
            };

            PullRequestManager.prototype._getFileNames = function () {
                return $(".meta .js-selectable-text").map(function (i, e) {
                    var fullPath = $(e).text().trim();
                    return _.last(fullPath.split("/"));
                });
            };

            PullRequestManager.prototype._markPullRequestOpened = function (pullRequestId) {
                this._currentPullRequestId = pullRequestId;
                this._statusesManager.markPullRequestOpened(this._repoId, pullRequestId);
            };

            PullRequestManager.prototype._syncComments = function (pullRequestId) {
                var self = this;
                var readComments = this._statusesManager.getReadCommentsOnPullRequest(this._repoId, pullRequestId, /*includeCommitComments*/true);
                $("[data-body-version]").each(function (i, e) {
                    var $e = $(e);
                    if ($e.css("display") === "none") { return; }
                    if (self._getCommentUserName($e) === self._userName) { return; }
                    var dataBodyVersion = $e.attr("data-body-version");
                    $e.find(".unread-label").remove();
                    if (readComments.indexOf(dataBodyVersion) === -1) {
                        $e.find(".timeline-comment-header-text").append("<span class='unread-label'>&nbsp;&nbsp; UNREAD</span>");
                        $e.find(".timeline-comment-header").css("background-color", "rgba(255, 239, 198, 0.4)");
                        self._markReadIfAppropriate(pullRequestId, $e, dataBodyVersion);
                    }
                    else {
                        $e.find(".timeline-comment-header").css("background-color", "");
                    }
                });
            };

            PullRequestManager.prototype._getCommentUserName = function ($element) {
                //return $element.find(".author").text();
                return "NOOP";
            };

            PullRequestManager.prototype._markReadIfAppropriate = function (pullRequestId, $element, dataBodyVersion) {
                var self = this;
                if ($element.visible()) {
                    setTimeout(function () {
                        if ($element.visible()) {
                            self._statusesManager.addReadComment(self._repoId, pullRequestId, dataBodyVersion);
                            self._syncComments(pullRequestId);
                        }
                    }, 2000);
                }
            };

            PullRequestManager.prototype._markPullRequestCommits = function (pullRequestId) {
                var commits = this._getCommits();
                this._statusesManager.markPullRequestCommits(this._repoId, pullRequestId, commits);
            };

            PullRequestManager.prototype._registerCommentsClickListener = function (pullRequestId) {
                var self = this;
                if (this._commentsClickListener.pullRequestId === pullRequestId) { return; }
                this._deregisterCommentsClickListener();
                $(".view-pull-request [data-body-version]").on("click", function (e) {
                    var dataBodyVersion = $(e.currentTarget).attr("data-body-version");
                    self._statusesManager.addReadComment(self._repoId, pullRequestId, dataBodyVersion);
                    self._syncComments(pullRequestId);
                });
                this._commentsClickListener = { pullRequestId: pullRequestId };
            };

            PullRequestManager.prototype._deregisterCommentsClickListener = function () {
                $(".view-pull-request [data-body-version]").off("click");
                this._commentsClickListener = { pullRequestId: null };
            };

            return PullRequestManager;
        })
        .factory("CommitManager", function () {
            function CommitManager(config) {
                this._repoId = config.repoId;
                this._userId = config.userId;
                this._userName = config.userName;
                this._statusesManager = config.statusesManager;
                this._commentsClickListener = { commitHash: null };
                this._currentCommitHash = null;
                this._startPolling();
            }

            CommitManager.prototype._startPolling = function () {
                var self = this;
                this._syncCommit();
                setInterval(function () { self._syncCommit(); }, 1000);
            };

            CommitManager.prototype._syncCommit = function () {
                if (!this._isCommitOpen()) {
                    this._deregisterCommentsClickListener();
                    return;
                }
                var commitHash = this._getCommitHash();
                if (this._currentCommitHash !== commitHash) {
                    this._markCommitOpened(commitHash);
                    this._markCommitPullRequests(commitHash);
                    this._registerCommentsClickListener(commitHash);
                    this._setupCommit(commitHash);
                }
                this._syncComments(commitHash);
            };

            CommitManager.prototype._markCommitOpened = function (commitHash) {
                this._currentCommitHash = commitHash;
            };

            CommitManager.prototype._markCommitPullRequests = function (commitHash) {
                var pullRequestIds = this._getPullRequestIds();
                this._statusesManager.markCommitPullRequests(this._repoId, commitHash, pullRequestIds);
            };

            CommitManager.prototype._getPullRequestIds = function () {
                return $(".pull-request a")
                    .map(function (i, e) {
                        var $e = $(e);
                        var pullRequestId = $e.text().replace("#", "");
                        return parseInt(pullRequestId, 10);
                    })
                    .toArray();
            };

            CommitManager.prototype._setupCommit = function (commitHash) {
                //TODO We'll probably need to link pull requets to commits here
            };

            CommitManager.prototype._registerCommentsClickListener = function (commitHash) {
                var self = this;
                if (this._commentsClickListener.commitHash === commitHash) { return; }
                this._deregisterCommentsClickListener();
                $("[data-body-version]").on("click", function (e) {
                    var dataBodyVersion = $(e.currentTarget).attr("data-body-version");
                    self._statusesManager.addReadCommentOnCommit(self._repoId, commitHash, dataBodyVersion);
                    self._syncComments(commitHash);
                });
                this._commentsClickListener = { commitHash: commitHash };
            };

            CommitManager.prototype._syncComments = function (commitHash) {
                var self = this;
                var readComments = this._statusesManager.getReadCommentsOnCommit(this._repoId, commitHash, /*includeCommitComment*/true);
                $("[data-body-version]").each(function (i, e) {
                    var $e = $(e);
                    if ($e.css("display") === "none") { return; }
                    if (self._getCommentUserName($e) === self._userName) { return; }
                    var dataBodyVersion = $e.attr("data-body-version");
                    $e.find(".unread-label").remove();
                    if (readComments.indexOf(dataBodyVersion) === -1) {
                        $e.find(".timeline-comment-header-text").append("<span class='unread-label'>&nbsp;&nbsp; UNREAD</span>");
                        $e.find(".timeline-comment-header").css("background-color", "rgba(255, 239, 198, 0.4)");
                        self._markReadIfAppropriate(commitHash, $e, dataBodyVersion);
                    }
                    else {
                        $e.find(".timeline-comment-header").css("background-color", "");
                    }
                });
            };

            CommitManager.prototype._markReadIfAppropriate = function (commitHash, $element, dataBodyVersion) {
                var self = this;
                if ($element.visible()) {
                    setTimeout(function () {
                        if ($element.visible()) {
                            self._statusesManager.addReadCommentOnCommit(self._repoId, commitHash, dataBodyVersion);
                            self._syncComments(commitHash);
                        }
                    }, 2000);
                }
            };

            CommitManager.prototype._getCommentUserName = function ($element) {
                //return $element.find(".author").text();
                return "NOOP";
            };

            CommitManager.prototype._getCommitHash = function () {
                return $(".full-commit span.js-selectable-text").text();
            };

            CommitManager.prototype._isCommitOpen = function () {
                return $(".full-commit").length !== 0;
            };

            CommitManager.prototype._deregisterCommentsClickListener = function () {
                $("[data-body-version]").off("click");
                this._commentsClickListener = { commitHash: null };
            };

            return CommitManager;
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
        .factory("main", function (ListManager, PullRequestManager, ghHttp, StatusesManager, CommitManager) {
            var run = function () {
                var repoId = parseInt($("#repository_id").val(), 10);
                var userId = parseInt($(".header-nav-link [data-user]").attr("data-user"), 10);
                var userName = $("[name='octolytics-actor-login']").attr("content");
                if (!repoId) { return; }
                var statusesManager = new StatusesManager({ userId: userId });
                var listManager = new ListManager({ userId: userId, userName: userName, repoId: repoId, statusesManager: statusesManager });
                var pullRequestManager = new PullRequestManager({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
                var commitManager = new CommitManager({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
                window.destroyGithubEnhancementsStorage = function () {
                    var keyStart = "githubenhancements";
                    _(localStorage)
                        .keys()
                        .filter(function (k) { return k.slice(0, keyStart.length) === keyStart } )
                        .each(function (k) { localStorage.removeItem(k); });
                };
            };
            return { run: run };
        });
    angular.injector(['ng', 'core']).invoke(function (main) { main.run(); });
})();

