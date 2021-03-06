var fs = require('fs');
var File = require('./File');
var Asset = require('./Asset');
var Waiter = require('./Waiter');

var chug;
setImmediate(function immediatelySetChug() {
  chug = require('../chug');
});

var fileRoot = process.cwd() + '/';

/**
 * A load is a set of assets on which chaining operations can be performed.
 */
var Load = module.exports = Waiter.extend({

  init: function init(location, parent) {
    var self = this;
    self.paths = [];
    self._super(parent);
    self.assets = [];
    self.watchablePaths = [];
    self.watchQueue = [];
    self.isWatching = false;
    self.isReplaying = false;
    self.replayableActions = [];
    self.changedLocation = '';
    self.ignoreList = [];
    self.customSort = false;
    if (location) {
      self.add(location);
    }
    self.then(function () {
      self.assets.sort(function (a, b) {
        var difference = a.sortIndex - b.sortIndex;
        if (difference) {
          return difference;
        }
        else {
          return a.location < b.location ? -1 : 1;
        }
      });
    });
  },

  /**
   * Add an array, file or directory of assets to the Load.
   */
  add: function add(location) {
    var self = this;
    if (location instanceof Array) {
      location.forEach(function addLocation(location) {
        self.add(location);
      });
    }
    else if (typeof location == 'string') {
      if (!self.isReady) {
        self.paths.push(location);
      }
      var path = location;
      if (path[0] != '/') {
        path = fileRoot + path;
      }
      self.addFile(path, 0);
    }
    else {
      chug._logger.error("Unexpected location type: " + JSON.stringify(location));
    }
  },

  /**
   * Add a file or directory to a potential fs.watch list.
   */
  addWatchable: function addWatchable(path) {
    var self = this;
    self.watchablePaths.push(path);
  },

  /**
   * Load a file with a given path, populating this Load with File assets.
   */
  addFile: function addFile(path, dirDepth) {
    var self = this;
    self.wait();
    fs.stat(path, function statFile(err, stat) {
      if (err) {
        self.unwait();
        chug._logger.error('Could not stat file: ' + path, err);
        return;
      }
      var modified = (new Date(stat.mtime)).getTime() / 1e3;
      if (stat.isDirectory()) {
        self.addDir(path, dirDepth, stat);
      } else {
        self.addAsset(File, path, stat);
      }
      if (stat.isDirectory() || dirDepth < 1) {
        self.addWatchable(path);
      }
      self.unwait();
    });
  },

  /**
   * Read a directory, adding its files and subdirectories to the Load.
   */
  addDir: function addDir(dir, dirDepth, stat) {
    var self = this;
    self.wait();
    fs.readdir(dir, function processDir(err, files) {
      chug = require('../chug');
      if (err) {
        self.unwait();
        chug._logger.error('Could not load directory: ' + dir, err);
        return;
      }
      files.forEach(function processFile(name) {
        var shouldIgnore = chug._ignorePattern.test(name);
        self.ignoreList.forEach(function (filenameOrPattern) {
          if (typeof filenameOrPattern == 'string') {
            shouldIgnore = shouldIgnore || (name == filenameOrPattern);
          } else {
            shouldIgnore = shouldIgnore || filenameOrPattern.test(name);
          }
        });
        if (!shouldIgnore) {
          var path = dir + '/' + name;
          self.addFile(path, dirDepth + 1);
        }
      });
      self.unwait();
    });
  },

  /**
   * Get an asset from cache if possible, otherwise create it.
   */
  addAsset: function addAsset(assetType, location, stat) {
    var self = this;
    chug = require('../chug');
    var asset = chug.cache.get(location);
    if (asset) {
      asset.addParent(self);
    }
    else {
      asset = new assetType(location, self);
      chug.cache.set(location, asset);
    }
    self.assets.push(asset);
    return asset;
  },

  /**
   * Ignore files with a given name or matching a pattern.
   */
  ignore: function ignore(filenameOrPattern) {
    var self = this;
    self.ignoreList.push(filenameOrPattern);
    return self;
  },

  /**
   * Run a callback on each asset in the load once they're all loaded.
   */
  each: function each(assetCallback) {
    var self = this;

    // Make sure we can replay this action when assets are modified.
    self.addReplayableAction(self.each, arguments);

    self.onceReady(function onceReadyEach() {

      // If we're replaying actions, only replay on assets that may have changed.
      if (self.isReplaying) {
        self.assets.forEach(function replayIfChanged(asset) {
          if (asset.location.indexOf(self.changedLocation) === 0){
            assetCallback(asset);
          }
        });
      }
      // Otherwise, perform the action on everything.
      else {
        self.assets.forEach(assetCallback);
      }
    });
    return self;
  },

  /**
   * Return a list of asset locations, or pass the list to a callback.
   */
  getLocations: function getLocations(callback) {
    var self = this;
    var locations = [];

    function pushLocation(asset) {
      locations.push(asset.location);
    }

    // If a callback is passed in, pass the list after iterating asynchronously.
    if (callback) {
      return self
        .each(pushLocation)
        .then(function () {
          callback(locations);
        });
    }

    // If there was no callback, just return the list of assets that are already loaded.
    self.assets.forEach(pushLocation);
    return locations;
  },

  /**
   * Return a HTML tags to refer to these assets.
   */
  getTags: function getTags(path, callback) {
    var self = this;
    var tags = '';

    // Path is optional, so the first argument might actually be the callback.
    if (typeof path == 'function') {
      callback = path;
      path = null;
    }

    // Path defaults to empty string.
    if (typeof path != 'string') {
      path = '';
    }

    function pushTag(asset) {
      var language = '';
      var location = asset.location.replace(/\.([a-z]+)$/, function (match, extension) {
        language = chug._targetLanguages[extension] || extension;
        return '.' + language;
      });
      if (location.indexOf(fileRoot) === 0) {
        location = location.substr(fileRoot.length - 1);
      }
      if (language == 'js') {
        tags += '<script src="' + path + location + '"></script>';
      }
      else if (language == 'css') {
        tags += '<link rel="stylesheet" href="' + path + location + '">';
      }
    }

    // If a callback is passed in, pass the tags after iterating asynchronously.
    if (callback) {
      return self
        .each(pushTag)
        .then(function () {
          callback(tags);
        });
    }

    // If there was no callback, just return tags for assets that are already loaded.
    self.assets.forEach(pushTag);
    return tags;
  },

  /**
   * Add an action that can be replayed after fs.watch sees changes.
   */
  addReplayableAction: function addReplayableAction() {
    if (!this.isReplaying) {
      this.replayableActions.push(arguments);
    }
  },

  /**
   * Replay actions after fs.watch sees changes.
   */
  replayActions: function replayActions(location) {
    var self = this;
    self.changedLocation = chug.changedLocation = location;
    self.isReplaying = true;
    self.replayableActions.forEach(function (action) {
      var method = action[0];
      var args = action[1];
      method.apply(self, args);
    });
    self.onceReady(function () {
      self.isReplaying = false;
    });
  },

  /**
   * Execute a callback once the load is ready.
   */
  then: function then(callback) {
    var self = this;
    self.addReplayableAction(self.then, arguments);
    self.onceReady(function onceReadyThen() {
      callback.apply(self);
    });
    return self;
  },

  /**
   * Concatenate assets into a new asset in a new or existing load.
   */
  concat: function(location, load) {
    var self = this;
    var isExistingLoad = !!load;

    // Mitigate circular dependency.
    chug = require('../chug');

    // Get or create the load that will contain the concatenated content.
    load = isExistingLoad ? load : chug();

    // Create a reference to the load that was concatenated.
    load.sourceLoad = self;

    self.addReplayableAction(self.concat, [location, load]);
    load.wait();
    if (!location) {
      location = self.paths[0].replace(/\*/, 'all');
    }
    self.then(function thenConcat() {
      var content = '';
      self.assets.forEach(function concatOne(asset) {
        // TODO: Perform concat either before or after compile.
        content += asset.getCompiledContent();
      });
      if (load.assets.length < 1) {
        load.addAsset(Asset, location);
      }
      var asset = load.assets[0];
      asset.setContent(content);
      if (isExistingLoad) {
        load.replayActions(asset.location);
      }
      load.unwait();
    });
    return load;
  },

  /**
   * Compile each asset.
   */
  compile: function compile() {
    var args = arguments;
    return this.each(function compileOne(asset) {
      asset.compile.apply(asset, args);
    });
  },

  /**
   * Cull each asset.
   */
  cull: function cull() {
    var args = arguments;
    return this.each(function cullOne(asset) {
      asset.cull.apply(asset, args);
    });
  },

  /**
   * Wrap JavaScript assets in a closure.
   */
  wrap: function wrap() {
    var args = arguments;
    return this.each(function wrapOne(asset) {
      asset.wrap.apply(asset, args);
    });
  },

  /**
   * Minify each asset's contents.
   */
  minify: function minify() {
    var args = arguments;
    return this.each(function minifyOne(asset) {
      asset.minify.apply(asset, args);
    });
  },

  /**
   * GZip each asset's contents.
   */
  gzip: function gzip() {
    var args = arguments;
    return this.each(function gzipOne(asset) {
      asset.gzip.apply(asset, args);
    });
  },

  /**
   * Add each asset as an app route.
   */
  route: function route() {
    var args = arguments;
    return this.each(function routeOne(asset) {
      asset.route.apply(asset, args);
    });
  },

  /**
   * Write each asset out to a directory.
   */
  write: function write() {
    var args = arguments;
    return this.each(function writeOne(asset) {
      asset.write.apply(asset, args);
    });
  },

  /**
   * Require each asset.
   */
  require: function requireAll() {
    var args = arguments;
    return this.each(function requireOne(asset) {
      asset.require.apply(asset, args);
    });
  },

  /**
   * Watch the watchable paths for changes.
   */
  watch: function watch(callback) {
    var self = this;
    if (callback) {
      self.watchQueue.push(callback);
    }
    if (!self.isWatching) {
      self.onceReady(function () {
        self.watchablePaths.forEach(function eachWatchablePath(path) {
          fs.watch(path, function (event, filename) {

            // Update the cache bust so that changes can actually be seen.
            if ((chug._server)) {
              chug._server._cacheBust = Math.round((new Date()).getTime() / 1000);
            }

            // Ignore JetBrains backup files.
            if (/___$/.test(filename)) {
              return;
            }

            var file = path + (filename ? '/' + filename : '');
            self.handleChange(file);
            self.onceReady(function watchReady() {
              self.watchQueue.forEach(function (callback) {
                callback.call(self, file, event);
              });
            });
          });
        });
      });
      self.isWatching = true;
    }
    return self;
  },

  /**
   * Handle a change to a location after an fs.watch event.
   */
  handleChange: function handleChange(location) {
    var self = this;

    // The location may have been deleted or moved, so we need to check its existence.
    self.wait();
    fs.exists(location, function handleChangeExists(exists) {

      // If the location exists, it may or may not be new.
      if (exists) {

        // The location exists, so re-read it or any sub-directory assets.
        var matchCount = 0;
        self.assets.forEach(function updateEach(asset) {
          if (asset.location.indexOf(location) === 0) {
            asset.readFile();
            matchCount++;
          }
        });

        // If there were no matches, this thing is new, so add it.
        if (!matchCount) {
          self.add(location);
        }
      }

      // The location no longer exists, so we need to get rid of its assets.
      else {

        // Get rid of it by rebuilding the asset array.
        var assets = [];
        self.assets.forEach(function updateEach(asset) {

          // Assets that are under (or are) the deleted location must be
          // removed from cache and not added to the assets array.
          if (asset.location.indexOf(location) === 0) {
            chug = require('../chug');
            chug.cache.remove(asset.location);
          }
          // Assets that didn't match are unaffected, so reference them.
          else {
            assets.push(asset);
          }
        });
        self.assets = assets;
      }
      self.unwait();
    });

    // Once changes have been applied, we can replay previously-run actions.
    self.onceReady(function onceReadyReplay() {
      self.replayActions(location);
    });

    return self;
  }
});
