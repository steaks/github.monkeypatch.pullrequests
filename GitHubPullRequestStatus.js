/* global $, _ */
(function () {
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

                    var pullRequestCommentsPromises = _.reduce(pullRequestIds, function (seed, pullRequestId) {
                        seed[pullRequestId] = ghHttp.get(repo.issues_url.replace("{/number}", "/" + pullRequestId + "/comments"));
                        return seed;
                    }, {});
                    var pullRequestCommitsPromises = _.reduce(pullRequestIds, function (seed, pullRequestId) {
                        seed[pullRequestId] = ghHttp.get(repo.pulls_url.replace("{/number}", "/" + pullRequestId ));
                        return seed;
                    }, {});

                    var commentsPromise = $q.all(pullRequestCommentsPromises).then(function (pullRequestsComments) { return pullRequestsComments; });
                    var commitsPromise = $q.all(pullRequestCommitsPromises).then(function (pullRequestsCommits) { return pullRequestsCommits; });

                    return $q.all({ comments: commentsPromise, commits: commitsPromise })
                        .then(function (commentsAndCommits) {
                            _.each(commentsAndCommits.comments, function (comments, pullRequestId) {
                                self._statuses[pullRequestId] = { users: {} };
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

            StatusesManager.prototype.markInProgress = function(repoId, pullRequestId, commits) {
                localStorage.setItem("githubenhancements_pullRequestsInProgress_" + repoId.toString() + "_" + pullRequestId.toString(), JSON.stringify({ commits: commits }));
            };

            StatusesManager.prototype._getRepos = function () {
                var self = this;
                if (this._repos) {
                    return $q.when(this._repos);
                }
                return ghHttp.get("user/repos").then(function (repos) { self._repos = repos; return repos; });
            }

            StatusesManager.prototype._setInProgressInfo = function (statuses, repoId, pullRequestId, userId, commits) {
                var inProgressJSON = localStorage.getItem("githubenhancements_pullRequestsInProgress_" + repoId.toString() + "_" + pullRequestId.toString());
                if (!statuses.users[userId] && inProgressJSON) {
                    statuses.users[userId] = StatusOptions.inProgress;
                }
                if (inProgressJSON) {
                    var seenCommits = JSON.parse(inProgressJSON).commits;
                    statuses.newCommits = commits > seenCommits;
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
                                self._renderListItemMetaInfo($element, pullRequestInfo);
                            });
                    })
                    .finally(function () { self._pullRequestIdsToDecorate = []; });
            };

            ListManager.prototype._renderListItemBackground = function (element, status) {
                if (status === StatusOptions.accept) {
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

            ListManager.prototype._renderListItemMetaInfo = function ($element, pullRequestInfo) {
                var accepts = _.filter(pullRequestInfo.users, function (val) { return val === StatusOptions.accept; }).length.toString();
                var rejects = _.filter(pullRequestInfo.users, function (val) { return val === StatusOptions.reject; }).length.toString();
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
            };

            return ListManager;
        })
        .factory("PullRequestManager", function () {
            function PullRequestManager(config) {
                this._repoId = config.repoId;
                this._userId = config.userId;
                this._statusesManager = config.statusesManager;
                this._startPolling();
            }

            PullRequestManager.prototype._startPolling = function() {
                var self = this;
                this._markInProgress();
                setInterval(function () { self._markInProgress(); }, 1000);
            };

            PullRequestManager.prototype._isPullRequestOpen = function () {
                return $(".view-pull-request").length !== 0;
            };

            PullRequestManager.prototype._getPullRequestId = function () {
                return parseInt($(".gh-header-number").text().substring(1), 10);
            };

            PullRequestManager.prototype._getCommits = function () {
                return parseInt($("#commits_tab_counter").text(), 10);
            };

            PullRequestManager.prototype._markInProgress = function () {
                if (!this._isPullRequestOpen()) { return; }
                var pullRequestId = this._getPullRequestId();
                var commits = this._getCommits();
                this._statusesManager.markInProgress(this._repoId, pullRequestId, commits);
            };
            return PullRequestManager;
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
        .factory("main", function (ListManager, PullRequestManager, ghHttp, StatusesManager) {
            var run = function () {
                var repoId = parseInt($("#repository_id").val(), 10);
                var userId = parseInt($(".header-nav-link [data-user]").attr("data-user"), 10);
                if (!repoId) { return; }
                var statusesManager = new StatusesManager({ userId: userId });
                var listManager = new ListManager({ userId: userId, repoId: repoId, statusesManager: statusesManager });
                var pullRequestManager = new PullRequestManager({ userId: userId, repoId: repoId, statusesManager: statusesManager });
            };
            return { run: run };
        });

    angular.injector(['ng', 'core']).invoke(function (main) {
        main.run();
    })
})();

