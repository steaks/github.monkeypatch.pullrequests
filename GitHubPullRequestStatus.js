/* global $, _, document */
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
      function Sidebar() { }

      Sidebar.prototype.init = function (config) {
        var self = this;
        this._scope = null;
        this._isOpen = false;
        this._animationDuration = 300;
        this._openCloseButtonAnimationDuration = 300;
        this._getFilesInterval = null;
        this._statusesManager = config.statusesManager;
        this._scope = $rootScope.$new();
        this._scope.showSettings = false;
        this._statusesManager.getSettings()
          .then(function (settings) {
            self._scope.settings = settings;
          });
        this._isMac = window.navigator.platform === "MacIntel";
        this._scope.metaKey = this._isMac ? "CMD" : "WIN";
      };

      Sidebar.prototype.setup = function () {
        var self = this;
        $(document).on("keydown", null, "meta+j", function () {
          self._scope.$apply(function () {
            self._scrollToFile(/*prev*/false);
          });
        });
        $(document).on("keydown", null, "meta+k", function () {
          self._scope.$apply(function () {
            self._scrollToFile(/*prev*/true);
          });
        });
        $(document).on("keydown", null, "alt+j", function () {
          self._scrollToCodeChange(/*prev*/false);
        });
        $(document).on("keydown", null, "alt+k", function () {
          self._scrollToCodeChange(/*prev*/true);
        });
        $(document).on("keydown", null, "ctrl+j", function () {
          self._scrollToComment(/*prev*/false);
        });
        $(document).on("keydown", null, "ctrl+k", function () {
          self._scrollToComment(/*prev*/true);
        });
        $(document).on("keydown", null, "ctrl+shift+j", function () {
          self._scrollToComment(/*prev*/false, /*unread*/true);
        });
        $(document).on("keydown", null, "ctrl+shift+k", function () {
          self._scrollToComment(/*prev*/true, /*unread*/true);
        });
        $(document).on("keydown", null, "alt+c", function () {
          self._toggleAllComments();
        });
        $(document).scroll(function () {
          self._setActiveFile();
        });
        $(window).on("hashchange", function () {
          self._setActiveFile();
        });
        this._renderSidebar();
        $timeout(function () {
          self._statusesManager.getSettings()
            .then(function (settings) {
              if (settings.open_side_bar_by_default) {
                self.open();
              } else {
                self.close();
              }
            });
        }, 500);
      };

      Sidebar.prototype.open = function () {
        var self = this;
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
          duration: this._openCloseButtonAnimationDuration,
          complete: function () {
            $openCloseButton.removeClass("right").addClass("left");
            $openCloseButton.animate({ left: "212px" }, { duration: self._animationDuration });
            $wrapper.animate({ marginLeft: "255px" }, { duration: self._animationDuration });
            $footerContainer.animate({ marginLeft: newFooterContainerMarginLeft.toString() + "px" }, { duration: self._animationDuration });
            $sidebar.animate({ left: "0px" }, { duration: self._animationDuration });
          }
        });
      };

      Sidebar.prototype.teardown = function () {
        this.close(/*teardown*/true);
      };

      Sidebar.prototype.close = function (teardown) {
        var self = this;
        var deferred = $q.defer();
        $interval.cancel(this._getFilesInterval);
        var $openCloseButton = $(".ghe__open-close-button");
        if (!this._isOpen) {
          if (teardown) {
            $openCloseButton.animate({ left: "-41px" }, {
              duration: this._openCloseButtonAnimationDuration,
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
            if (!teardown) {
              $openCloseButton.animate({left: "10px"}, {
                duration: self._openCloseButtonAnimationDuration,
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

      Sidebar.prototype._setActiveFile = function (activeFile) {
        var markedActiveFile = false;
        if (this._scope.files && this._scope.files.length) {
          if (activeFile) {
            _.each(this._scope.files, function (file) { file.active = false; });
            activeFile.active = true;
          } else {
            _.each(this._scope.files, function (file) {
              if (!markedActiveFile) {
                file.active = !markedActiveFile && file.$file.visible(/*partial*/true);
                markedActiveFile = file.active;
              } else {
                file.active = false;
              }
            });
          }
        }
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
            $interval.cancel(self._getFilesInterval);
            self._getFilesInterval = $interval(function () {
              self._scope.files = self._getFiles();
              if (self._scope.files.length) {
                $interval.cancel(self._getFilesInterval);
                $timeout(function () { self._setActiveFile(); })
              }
            }, 1000);
          });
        }
        self._scope.toExpand = false;
        if ($gheSidebar.length) {
          return;
        }
        var self = this;
        var template =
          "<div class='ghe__sidebar'>" +
          "  <div class='ghe__chevron ghe__open-close-button' ng-click='toggleSidebar()'></div>" +
          "  <div class='ghe__sidebar-header'>" +
          "    <div class='ghe__title'>PRs Improved</div>" +
          "    <div class='ghe__settings-button octicon octicon-gear' ng-click='toggleSettings()'></div>" +
          "  </div>" +
          "  <div class='ghe__sidebar-files-wrapper' ng-show='!showSettings'>" +
          "    <a class='ghe__toggle-all-comments-link' ng-click='toggleAllComments()' ng-show='!toExpand'>collapse notes</a>" +
          "    <a class='ghe__toggle-all-comments-link' ng-click='toggleAllComments()' ng-show='toExpand'>expand notes</a>" +
          "    <div class='ghe__sidebar-files'>" +
          "      <div ng-repeat='file in files' class='ghe__file-wrapper'>" +
          "         <div class='ghe__file-icon' ng-bind-html='file.icon'></div>" +
          "         <a class='ghe__file-link' ng-click='openFile(file)' title='{{file.path}}' ng-class=\"{'active': file.active}\">{{file.name}}</a><a class='ghe__comment-link' ng-click='toggleComments(file)' title='toggle notes'><span class='octicon octicon-comment'>{{file.numComments}}</span></a>" +
          "      </div>" +
          "      <div class='ghe__files-not-loaded-message' ng-if='files.length === 0'>Your files are not loaded.  They will load when you click on the \"Files Changed\" link.</div>" +
          "    </div>" +
          "  </div>" +
          "  <div class='ghe__sidebar-settings' ng-show='showSettings'>" +
          "    <div class='ghe__settings-row ghe__settings-checkbox-row'><label class='ghe__settings-checkbox-label'><input class='ghe__settings-checkbox-input' type='checkbox' ng-model='settings.open_side_bar_by_default' ng-change='settingChanged(\"open_side_bar_by_default\")'>Open sidebar by default</label></div>" +
          "    <div class='ghe__settings-row'><label>Next/prev file:</label></div>" +
          "    <div class='ghe__settings-row'><span class='ghe__shortcut-keys'>{{metaKey}} + J/K</span></div>" +
          "    <div class='ghe__settings-row'><label>Next/prev change:</label></div>" +
          "    <div class='ghe__settings-row'><span class='ghe__shortcut-keys'>ALT + J/K</span></div>" +
          "    <div class='ghe__settings-row'><label>Next/prev comment:</label></div>" +
          "    <div class='ghe__settings-row'><span class='ghe__shortcut-keys'>CTRL + J/K</span></div>" +
          "    <div class='ghe__settings-row'><label>Next/prev unread comment:</label></div>" +
          "    <div class='ghe__settings-row'><span class='ghe__shortcut-keys'>CTRL + SHIFT + J/K</span></div>" +
          "    <div class='ghe__settings-row'><label>Toggle comments:</label></div>" +
          "    <div class='ghe__settings-row'><span class='ghe__shortcut-keys'>ALT + C</span></div>" +
          "  </div>" +
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
        this._scope.toggleAllComments = function () {
          self._toggleAllComments();
        };
        this._scope.openFile = function(file) {
          self._openFile(file);
        };
        this._scope.toggleSettings = function () {
          self._scope.showSettings = !self._scope.showSettings;
        };
        this._scope.settingChanged = function (setting) {
          self._statusesManager.updateSettings(self._scope.settings);
        };
        var $sidebar = $compile(template)(this._scope);
        var $body = $("body");
        $body.prepend($sidebar);
        $timeout(function () { self._setActiveFile(); })
      };

      Sidebar.prototype._toggleAllComments = function () {
        var self = this;
        _.each(self._scope.files, function (file) {
          var commentsShown = file.$toggleCommentsCheckbox.is(":checked");
          if (self._scope.toExpand !== commentsShown) {
            file.$toggleCommentsCheckbox[0].click();
          }
        });
        self._scope.toExpand = !self._scope.toExpand;
      };

      Sidebar.prototype._getFiles = function () {
        var files = $(".table-of-contents li a:not(.tooltipped)").map(function (i, e) {
          var $e = $(e);
          var $diffIcon = $e.siblings(".octicon").clone();
          var icon = $sce.trustAsHtml($diffIcon[0].outerHTML);
          var fullPath = $e.text().trim();
          return { name: _.last(fullPath.split("/")), href: $e.attr("href"), icon: icon, path: fullPath, $file: $("#diff-"+i), index: i, active: false };
        });
        var fileCommentInfos = $(".file.js-details-container").map(function (i, e) {
          var $e = $(e);
          return { $toggleCommentsCheckbox: $e.find(".js-toggle-file-notes"), numComments: $e.find("[data-body-version]:visible").length };
        });
        _.each(files, function (file, i) {
          var fileCommentInfo = fileCommentInfos[i];
          _.extend(file, fileCommentInfo);
        });
        return files;
      };

      Sidebar.prototype._getCodeChanges = function () {
        var changedLines = $(".blob-code-addition:visible, .blob-code-deletion:visible");
        var filteredChangedLines = [];
        var i = 0;
        _.each(changedLines, function (changedLine) {
          var $changedLine = $(changedLine);
          var $row = $changedLine.closest("tr");
          var $rowAbove = $row.prev();
          var $rowAboveHasChanges = $rowAbove.find(".blob-code-addition, .blob-code-deletion").length;
          if (!$rowAboveHasChanges) {
            filteredChangedLines.push({ $element: $changedLine, index: i });
            i++;
          }
        });
        return filteredChangedLines;
      };

      Sidebar.prototype._getComments = function (onlyUnread) {
        var comments = $("[data-body-version]:visible");
        if (onlyUnread) {
          comments = comments.filter(".unread-label");
        }
        return comments.map(function (i, e) {
          return { $element: $(e), index: i };
        });
      };

      Sidebar.prototype._scrollToFile = function (prev) {
        var self = this;
        var $files = this._scope.files;
        if (!$files.length) { return; }
        var currentFile = self._currentFile;
        var nextFile;
        if (!currentFile || !currentFile.$file.visible(/*partial*/true)) {
          nextFile = _.find($files, function (file) {
            if (file.$file.visible(/*partial*/true)) {
              return file;
            }
          });
          if (!nextFile) { nextFile = $files[0]; }
        } else {
          nextFile = $files[currentFile.index + (!prev ? 1 : -1)] || $files[(!prev ? 0 : $files.length-1)];
        }
        self._currentFile = nextFile;
        self._openFile(nextFile);
      };

      Sidebar.prototype._scrollToCodeChange = function(prev) {
        var self = this;
        var codeChanges = this._getCodeChanges();
        if (!codeChanges.length) { return; }
        var currentCodeChange = self._currentCodeChange;
        var nextCodeChange;
        if (!currentCodeChange || !currentCodeChange.$element.visible(/*partial*/true)) {
          nextCodeChange = _.find(codeChanges, function (codeChange) {
            if (codeChange.$element.visible(/*partial*/true)) {
              return codeChange;
            }
          });
          if (!nextCodeChange) { nextCodeChange = codeChanges[0]; }
        } else {
          nextCodeChange = codeChanges[currentCodeChange.index + (!prev ? 1 : -1)] || codeChanges[(!prev ? 0 : codeChanges.length-1)];
        }
        self._currentCodeChange = nextCodeChange;
        $.scrollTo(nextCodeChange.$element, { offset: -150 });
      };

      Sidebar.prototype._scrollToComment = function(prev, unread) {
        var self = this;
        var comments = this._getComments(unread);
        if (!comments.length) { return; }
        var currentComment = self._currentComment;
        var nextComment;
        if (!currentComment || !currentComment.$element.visible(/*partial*/true)) {
          nextComment = _.find(comments, function (comment) {
            if (comment.$element.visible(/*partial*/true)) {
              return comment;
            }
          });
          if (!nextComment) { nextComment = comments[0]; }
        } else {
          nextComment = comments[currentComment.index + (!prev ? 1 : -1)] || comments[(!prev ? 0 : comments.length-1)];
        }
        self._currentComment = nextComment;
        $.scrollTo(nextComment.$element, { offset: -150 });
      };

      Sidebar.prototype._openFile = function (file) {
        var $pullRequestFilesLink = $("[data-container-id='files_bucket']");
        if (window.location.pathname.indexOf("files") === -1) {
          if ($pullRequestFilesLink.length) {
            $pullRequestFilesLink[0].click();
          }
        }
        window.location.hash = file.href;
        this._setActiveFile(file);
      };

      return new Sidebar();
    })
    .factory("StatusesManager", function (StatusOptions, $q, ghHttp, gheData) {
      function StatusesManager(config) {
        this._statuses = {};
        this._userId = config.userId;
        this._repoOwnerName = config.repoOwnerName;
        this._repoName = config.repoName;
      }

      StatusesManager.prototype.getFromServer = function (repoId, pullRequestIds) {
        var self = this;
        return this._getRepo().then(function (repo) {
          if (repo.id !== repoId) { return; }

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

          var pullRequestsToGet = _.map(pullRequestIds, function (pullRequestId) {
            return [{
              path: "pullRequestCommits.{repoId}.{pullRequestId}",
              params: { repoId: repoId, pullRequestId: pullRequestId }
            }, {
              path: "pullRequestOpened.{repoId}.{pullRequestId}",
              params: { repoId: repoId, pullRequestId: pullRequestId }
            }, {
              path: "pullRequestStatus.{repoId}.{pullRequestId}",
              params: { repoId: repoId, pullRequestId: pullRequestId }
            }];
          });

          var gheInfo = gheData.getMultiple(_.flatten(pullRequestsToGet));
          var issueCommentsPromise = $q.all(issueCommentsPromises).then(function (issueComments) { return issueComments; });
          var pullRequestCommentsPromise = $q.all(pullRequestCommentsPromises).then(function (pullRequestsComments) { return pullRequestsComments; });
          var commitsPromise = $q.all(pullRequestCommitsPromises).then(function (pullRequestsCommits) { return pullRequestsCommits; });

          return $q.all({ issueComments: issueCommentsPromise, pullRequestComments: pullRequestCommentsPromise, commits: commitsPromise, gheInfo: gheInfo })
            .then(function (commentsAndCommits) {
              var promises = _.map(commentsAndCommits.issueComments, function (comments, pullRequestId) {
                var allComments = commentsAndCommits.pullRequestComments[pullRequestId].concat(comments);
                var mostRecentComment =
                  _(allComments)
                    .filter(function (c) { return c.user.id !== self._userId; })
                    .max(function (c) { return new Date(c.updated_at); })
                    .value();
                self._statuses[pullRequestId] = { users: {}, mostRecentCommentDatetime: mostRecentComment ? new Date(mostRecentComment.updated_at) : null };
                var commits = commentsAndCommits.commits[pullRequestId].commits;
                return self.getPullRequestStatus(repoId, pullRequestId).then(function (status) {
                  if (status) {
                    self._statuses[pullRequestId].users[status.git_hub_user] = status.status;
                  }
                }).then(function () {
                  return self._setInProgressInfo(self._statuses[pullRequestId], repoId, pullRequestId, self._userId, commits);
                });
              });
              return $q.all(promises).then(function () { return self._statuses; });
            })
        });
      };

      StatusesManager.prototype.markPullRequestCommits = function(repoId, pullRequestId, commits) {
        gheData.set("pullRequestCommits.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId }, commits);
      };

      StatusesManager.prototype.getPullRequestCommits = function (repoId, pullRequestId) {
        return gheData.get("pullRequestCommits.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId });
      };

      StatusesManager.prototype.markCommitPullRequests = function(repoId, commitHash, pullRequestIds) {
        gheData.set("commitPullRequests.{repoId}.{commitHash}", { repoId: repoId, commitHash: commitHash }, pullRequestIds);
      };

      StatusesManager.prototype.getCommitPullRequests = function (repoId, commitHash) {
        return gheData.get("commitPullRequests.{repoId}.{commitHash}", { repoId: repoId, commitHash: commitHash });
      };

      StatusesManager.prototype.getReadCommentsOnPullRequest = function (repoId, pullRequestId) {
        return this.getPullRequestCommits(repoId, pullRequestId)
          .then(function (commitObjs) {
            var commits = _.map(commitObjs, function (o) { return o.commit_hash; });
            return gheData.get("pullRequestReadComments.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId }, {
              method: "POST",
              data: { data: commits, method: "POST" }
            });
        });
      };

      StatusesManager.prototype.getReadCommentsOnCommit = function (repoId, commitHash) {
        return this.getCommitPullRequests(repoId, commitHash)
          .then(function (pullRequestObjs) {
            var pullRequestIds = _.map(pullRequestObjs, function (o) { return o.pull_request_id; });
            return gheData.get("commitReadComments.{repoId}.{commitHash}", { repoId: repoId, commitHash: commitHash }, {
              data: { data:  pullRequestIds },
              method: "POST"
            });
          });
      };

      StatusesManager.prototype.addReadComment = function (repoId, pullRequestId, comment) {
        gheData.set("pullRequestReadComments.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId }, comment);
      };

      StatusesManager.prototype.addReadCommentOnCommit = function (repoId, commitHash, comment) {
        gheData.set("commitReadComments.{repoId}.{commitHash}", { repoId: repoId, commitHash: commitHash }, comment);
      };

      StatusesManager.prototype.markPullRequestOpened = function (repoId, pullRequestId) {
        var utcDateTime = new Date().toUTCString();
        gheData.set("pullRequestOpened.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId }, utcDateTime);
      };

      StatusesManager.prototype.getPullRequestOpened = function (repoId, pullRequestId) {
        return gheData.get("pullRequestOpened.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId });
      };

      StatusesManager.prototype.getPullRequestStatus = function (repoId, pullRequestId) {
        return gheData.get("pullRequestStatus.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId });
      };

      StatusesManager.prototype.markPullRequestStatus = function (repoId, pullRequestId, status) {
        gheData.set("pullRequestStatus.{repoId}.{pullRequestId}", { repoId: repoId, pullRequestId: pullRequestId }, status);
      };

      StatusesManager.prototype.getSettings = function () {
        return gheData.get("settings");
      };

      StatusesManager.prototype.updateSettings = function (settings) {
        gheData.set("settings", { userId: this._userId }, settings);
      };

      StatusesManager.prototype._getRepo = function () {
        var self = this;
        if (this._repo) {
          return $q.when(this._repo);
        }
        return ghHttp.get("repos/{repoOwnerName}/{repoName}".substitute({ repoOwnerName: this._repoOwnerName, repoName: this._repoName }))
          .then(function (repos) { self._repos = repos; return repos; });
      };

      StatusesManager.prototype._setInProgressInfo = function (statuses, repoId, pullRequestId, userId, commits) {
        return this.getPullRequestCommits(repoId, pullRequestId)
          .then(function (seenCommits) {
            if (!statuses.users[userId] && seenCommits.length) {
              statuses.users[userId] = StatusOptions.inProgress;
            }
            if (seenCommits.length) {
              statuses.newCommits = commits > seenCommits.length;
            }
          });
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
    .factory("listManager", function (StatusOptions) {
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
        return $(".issues-listing .table-list li")
          .filter(function (i, e) {
            return $(e).find(".octicon-git-pull-request").length;
          });
      };

      ListManager.prototype._filterToNewPullRequests = function (pullRequestListItems) {
        return pullRequestListItems.filter(function (i, e) { return $(e).find(".enhancements-pull-request-meta-info-container").length === 0; });
      };

      ListManager.prototype._getPullRequestIds = function (pullRequestListItems) {
        return pullRequestListItems.map(function(i, e) { return parseInt($(e).find("input").val(), 10); });
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
                var pullRequestId = parseInt($element.find("input").val(), 10);
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
        this._statusesManager.getPullRequestOpened(this._repoId, pullRequestId)
          .then(function (lastOpenedDatetime) {
            lastOpenedDatetime = new Date(lastOpenedDatetime);
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
            if (mostRecentCommentDatetime > lastOpenedDatetime ||
               (!isNaN(mostRecentCommentDatetime.getTime()) && isNaN(lastOpenedDatetime.getTime()))
            ) {
              $element
                .find(".issue-meta .enhancements-pull-request-meta-info-container")
                .append("<span>&nbsp;&nbsp; NEW COMMENTS</span>");
            }
          });
      };

      return { init: function (config) { return new ListManager(config); } };
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
        $("[data-body-version]:visible").on("click", function (e) {
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
        $("[data-body-version]:visible").off("click");
        $interval.cancel(this._interval);
      };

      CommentsManager.prototype._sync = function () {
        var self = this;
        this._getReadComments()
          .then(function (readComments) {
            $("[data-body-version]:visible").each(function (i, e) {
              var $e = $(e);
              if ($e.css("display") === "none") { return; }
              if (self._getCommentUserName($e) === self._userName) { return; }
              var dataBodyVersion = $e.attr("data-body-version");
              $e.find(".unread-label").remove();
              if (!_.any(readComments, function (c) { return c.comment_id === dataBodyVersion; })) {
                $e.find(".timeline-comment-header-text").append("<span class='unread-label'>&nbsp;&nbsp; UNREAD</span>");
                $e.find(".timeline-comment-header").css("background-color", "rgba(255, 239, 198, 0.4)");
                self._markReadIfAppropriate($e, dataBodyVersion);
              } else {
                $e.find(".timeline-comment-header").css("background-color", "");
              }
            });
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
          }, 1000);
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
          getDiffId: config.getDiffId,
          setupStatusButtons: config.setupStatusButtons
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
        this._setupFileExpander();
        this._setupStatusButtons(diffId);
        sidebar.setup();
      };

      DiffManager.prototype._setupStatusButtons = function(diffId) {
        if (this._callbacks.setupStatusButtons) {
          this._callbacks.setupStatusButtons(diffId);
        }

      };

      DiffManager.prototype._tearDown = function () {
        if (this._clean) { return; }
        this._diffId = null;
        this._commentsManager.stop();
        this._tearDownFileExpander();
        sidebar.teardown();
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

      DiffManager.prototype._setupFileExpander = function () {
        $("#files .file .file-header").on("click.fileExpander", function (e) {
          var $target = $(e.target);
          if ($target.hasClass(".file-actions") || $target.closest(".file-actions").length > 0) { return; }
          var $e = $(e.currentTarget);
          var $body = $e.closest(".file").find(".blob-wrapper");
          if ($body.css("display") === "none") {
            $body.css("display", "");
          } else {
            $body.css("display", "none");
          }
        });
      };

      DiffManager.prototype._tearDownFileExpander = function () {
        $("#files .file .file-header").off("click.fileExpander");
      };

      return DiffManager;
    })
    .factory("pullRequestManager", function (CommentsManager, DiffManager, StatusOptions, $compile, $rootScope) {
      var init = function(config) {
        var commentsManager = new CommentsManager({
          userName: config.userName,
          onRead: function (diffId, commentId) {
            config.statusesManager.addReadComment(config.repoId, diffId, commentId);
          },
          getReadComments: function (diffId) {
            return config.statusesManager.getReadCommentsOnPullRequest(config.repoId, diffId);
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
          },
          setupStatusButtons: function (diffId) {
            config.statusesManager.getPullRequestStatus(config.repoId, diffId).then(function (statusObj) {
              var scope = $rootScope.$new();
              if (statusObj && statusObj !== "null") {
                scope.status = parseInt(statusObj.status, 10);
              } else {
                scope.status = null;
              }
              scope.statusOptions = StatusOptions;
              scope.submitStatus = function (statusOption) {
                scope.status = statusOption;
                config.statusesManager.markPullRequestStatus(config.repoId, diffId, statusOption);
              };
              var buttonGroup =
                "<div class='btn-group ghe__status-buttons'>" +
                  "<button type='button' class='btn' ng-click='submitStatus(statusOptions.accept)' ng-class='{ \"selected\": status === statusOptions.accept }'>Approve</button>" +
                  "<button type='button' class='btn' ng-click='submitStatus(statusOptions.reject)' ng-class='{ \"selected\": status === statusOptions.reject }'>Reject</button>" +
                  //"<button type='button' class='btn' ng-click='submitStatus(statusOptions.complete)' ng-class='{ \"selected\": status === statusOptions.complete }'>Complete</button>" +
                "</div>";
              var $buttonGroup = $compile(buttonGroup)(scope);
              $(".tabnav-pr .tabnav-tabs").append($buttonGroup);
            });
          }
        });
      };

      return { init: init };
    })
    .factory("commitManager", function (CommentsManager, DiffManager) {
      var init = function(config) {
        var commentsManager = new CommentsManager({
          userName: config.userName,
          onRead: function (diffId, commentId) {
            config.statusesManager.addReadCommentOnCommit(config.repoId, diffId, commentId);
          },
          getReadComments: function (diffId) {
            return config.statusesManager.getReadCommentsOnCommit(config.repoId, diffId);
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

      return { init: init };
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
    .factory("ghHttp", function ($http, parseQueryString, $q, gheHttp) {
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
              Accept: "application/vnd.github.moondragon+json"
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

      GHHttp.prototype.initAccessToken = function () {
        return this.get("user", { })
          .then(function () {
            return gheHttp.post("configure", { gitHubUserId: window.gitHubUserId });
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
        else if (queryString.code) {
          return $http.post(window.platformUrl + "/enhancements/requestAccessToken?code=" + queryString.code)
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
    .factory("gheCache", function () {
      function CacheNode(value) {
        this._value = value;
        this._isDirty = false;
      }

      CacheNode.prototype = {
        get value() {
          return angular.copy(this._value);
        },
        set value(val) {
          this._isDirty = false;
          this._value = val;
        },
        get isDirty() {
          return this._isDirty;
        },
        markDirty: function () {
          this._isDirty = true;
        }
      };

      function GHECache() {
        this._root = {};
      }

      GHECache.prototype = {
        get: function (path) {
          return this._root[path];
        },
        set: function (path, value) {
          this._root[path] = new CacheNode(value);
        },
        markDirty: function (path) {
          var cacheNode = this._root[path];
          if (cacheNode) {
            cacheNode.markDirty();
          }
        }
      };

      return new GHECache();
    })
    .factory("gheData", function (gheHttp, gheCache, $q) {
      function RequestConfig(path, params, config) {
        this.cachePath = path.substitute(params).replaceAll(".", "_");
        this.params = params;
        var firstPeriod = path.indexOf(".");
        this.url = path.substring(0, firstPeriod !== -1 ? firstPeriod : path.length);
        this.config = config;
      }

      function GHEData() {
        this.requests = { };
        this.nextRequestId = 0;
      }

      GHEData.prototype = {
        get: function (path, params, config) {
          var self = this;
          var requestConfig = new RequestConfig(path, params, config);

          var cacheNode = gheCache.get(requestConfig.cachePath);
          if (cacheNode && !cacheNode.isDirty) {
            return $q.when(cacheNode.value);
          }

          var currentRequest = this.getRequest(requestConfig.cachePath, "get");
          if (currentRequest) {
            return currentRequest;
          }

          var request = this._getFromHttp(requestConfig)
            .then(/*success*/function (data) { self.deregisterRequest(requestConfig.cachePath, "get", request); return data; },
                  /*fail*/function (data) { self.deregisterRequest(requestConfig.cachePath, "get", request); return data; });

          this.registerRequest(requestConfig.cachePath, "get", request);
          return request;
        },
        getMultiple: function (params) {
          _.filter(params, function (p) {
            var cachePath = p.path.substitute(p.params).replaceAll(".", "_");
            var cacheNode = gheCache.get(cachePath);
            return !cacheNode || cacheNode.isDirty;
          });
          return gheHttp.post("multiple", params)
            .then(function (response) {
              _.each(response.data, function (resp) {
                var cachePath = resp.path.substitute(resp.params).replaceAll(".", "_");
                gheCache.set(cachePath, resp.data)
              })
          });
        },
        set: function (path, params, data) {
          var self = this;
          var requestConfig = new RequestConfig(path, params);
          gheCache.markDirty(requestConfig.cachePath);

          var request = gheHttp
            .post(requestConfig.url, data, { params: params } )
            .finally(function () {
              self.deregisterRequest(requestConfig.cachePath, "post", request);
            });

          this.registerRequest(requestConfig.cachePath, "post", request);
        },
        registerRequest: function (cachePath, type, request) {
          var requestNode = this.requests[cachePath];
          if (!requestNode) {
            requestNode = {
              get: null,
              post: []
            };
            this.requests[cachePath] = requestNode;
          }
          if (type === "get") {
            requestNode.get = request;
          } else {
            requestNode.post.push(request);
            if (requestNode.get) {
              requestNode.get.invalid = true;
            }
          }
          request.requestId = this.nextRequestId;
          this.nextRequestId++;
        },
        deregisterRequest: function (cachePath, type, registeredRequest) {
          var requestNode = this.requests[cachePath];
          if (type === "get") {
            if (requestNode.get.requestId === registeredRequest.requestId) {
              requestNode.get = null;
            } else {
              throw new Error("Request ids don't match");
            }
          } else {
            var requestRemoved = false;
            _.remove(requestNode.post, function (r) {
              var toRemove = r.requestId === registeredRequest.requestId;
              if (toRemove) {
                requestRemoved = true;
              }
              return toRemove;
            });
            if (!requestRemoved) { throw new Error("Request id did not match"); }
          }
        },
        getRequest: function (cachePath, type) {
          var requestNode = this.requests[cachePath];
          if (requestNode) {
            if (type === "get") {
              return requestNode.get;
            } else {
              return requestNode.post;
            }
          }
          return null;
        },
        _getFromHttp: function (requestConfig) {
          var self = this;
          var request = gheHttp.get(requestConfig.url, requestConfig.params, requestConfig.config)
            .then(function (data) {
              var currentPostRequests;
              if (request.invalid) {
                request.invalid = false;
                currentPostRequests = self.getRequest(requestConfig.cachePath, "post");
                return $q.all(currentPostRequests).then(function () { return self._getFromHttp(requestConfig); });
              }
              gheCache.set(requestConfig.cachePath, data);
              return data;
            });
          return request;
        }
      };

      return new GHEData();
    })
    .factory("gheHttp", function ($http) {
      function GHEHttp() {}

      GHEHttp.prototype = {
        get: function (url, params, config) {
          var accessToken = localStorage.getItem("githubenhancements_accessToken");
          var decoratedParams = angular.extend({ accessToken: accessToken, isGet: true }, params);
          config = config || {};
          config.url = window.platformUrl + "/enhancements/" + url;
          config.params = decoratedParams;
          config.method = config.method || "GET";
          return $http(config)
            .then(function(response) {
              return response.data;
            });
        },
        post: function (url, data, config) {
          config = config || {};
          config.params = config.params || {};
          var accessToken = localStorage.getItem("githubenhancements_accessToken");
          var decoratedParams = angular.extend({ accessToken: accessToken }, config.params);
          config.method = config.method || "POST";
          config.url = window.platformUrl + "/enhancements/" + url;
          config.params = decoratedParams;
          config.data = { data: data || {} };
          return $http(config);
        }
      };

      return new GHEHttp();
    })
    .factory("smartCopying", function () {
      var init = function () {
        function resolveLineEnding(selectionText, lines) {
          if (selectionText.split(/\r\n/).length === lines.length) {
            return "\r\n";
          }
          else if (selectionText.split(/\n/).length === lines.length) {
            return "\n";
          }
          else {
            return "\r";
          }
        }

        $(document).on("copy", function () {
          if (!window.location.href.match(/.*\/pull.*/) && !window.location.href.match(/.*\/commit.*/)) {
            return;
          }
          var selection = window.getSelection(),
            selectionText = selection.toString(),
            lines = selectionText.split(/\r\n|\r|\n/),
            metaInfoRegex = /@@ -[0-9]+,[0-9]+ \+[0-9]+,[0-9]+ *@@[ ]?/,
            lineEnding = resolveLineEnding(selectionText, lines),
            cleanedSelectionText;

          cleanedSelectionText = lines.reduce(function (agg, curr, index) {
            var cleanedCurr = curr[0] === "+" || curr[0] === "-" || curr.charCodeAt(0) === 32 || curr.charCodeAt(0) === 160
              ? curr.replace(metaInfoRegex, "").substr(1)
              : curr.replace(metaInfoRegex, "");
            return agg + cleanedCurr + (index !== lines.length - 1 ? lineEnding : "");
          }, "");
          //I'm not exactly sure why a timeout is useful here.  The behavior indicates that with out a timeout sometimes
          //the copy clipboard does not actually have the correctly cleaned text.  The timeout seems to mitigate that problem.
          //My best guess is that there is a race condition and the timeout makes this code "lose" the race condition...so
          //the last text in the clipboard is this cleaned text rather than the regular text.
          setTimeout(function () { chrome.runtime.sendMessage({ cleanedSelectionText: cleanedSelectionText }); });
        });
      };
      return { init: init }
    })
    .factory("monkeyPatch", function () {
      return {
        run: function () {
          if (!String.prototype.substitute) {
            (function () {
              var subregex = /\{\s*([^|}]+?)\s*(?:\|([^}]*))?\s*\}/g;
              //Perform placeholder substitution on str by matching {placeholder}
              //with keys in the provided dict.  For example,
              //substitute("The happy {animal}", { animal : "dog" }) will return
              //The happy dog.
              //substitute was taken from Y.Lang.sub (http://yuilibrary.com/yui/docs/api/classes/Lang.html#method_sub)
              String.prototype.substitute = function (dict) {
                return this.toString().replace(subregex, function (match, key) {
                  return dict[key] === undefined ? match : dict[key];
                });
              };
            })();
          } else {
            throw new Error("String.prototype.substitute is already defined");
          }

          if (!String.prototype.replaceAll) {
            (function () {
              function escapeRegExp(string) {
                return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
              }
              String.prototype.replaceAll = function (find, replace) {
                return this.toString().replace(new RegExp(escapeRegExp(find), 'g'), replace);
              };
            })();
          } else {
            throw new Error("String.prototype.replaceAll is already defined");
          }
        }
      };
    })
    .factory("main", function (listManager, pullRequestManager, ghHttp, StatusesManager, commitManager, smartCopying, sidebar, monkeyPatch) {
      var run = function () {
        monkeyPatch.run();
        var repoId = parseInt($("#repository_id").val(), 10);
        var userId = parseInt($("[name='octolytics-actor-id']").attr("content"), 10);
        window.gitHubUserId = userId;
        var userName = $("[name='octolytics-actor-login']").attr("content");
        var repoOwnerName = $(".author span").text();
        var repoName = $("a[data-pjax='#js-repo-pjax-container']").text();
        if (!repoId) { return; }
        ghHttp.initAccessToken().then(function () {
          var statusesManager = new StatusesManager({ userId: userId, repoOwnerName: repoOwnerName, repoName: repoName });
          sidebar.init({ statusesManager: statusesManager });
          listManager.init({ userId: userId, userName: userName, repoId: repoId, statusesManager: statusesManager });
          pullRequestManager.init({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
          commitManager.init({ userId: userId, repoId: repoId, statusesManager: statusesManager, userName: userName });
          smartCopying.init();
        });
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

window.platformUrl = "https://www.platform.githubenhancements.com";
window.platformUrl = "https://41c9e3ff.ngrok.com";
