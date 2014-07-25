
const PATH = require("path");
const FS = require("fs-extra");
const ASSERT = require("assert");
const VFS = require("..");
const PACKAGE_INSIGHT = require("pinf-for-nodejs/node_modules/pinf-it-package-insight");
const PINF = require("pinf-for-nodejs");
const HTTP = require("http");
const URL = require("url");

//const MODE = "test";
const MODE = "write";

const DEBUG = false;

const PROXY_PORT = 8082;
const CONTENT_PORT = 8020;


describe('vfs', function() {

	this.timeout(20 * 1000);

	it('should export `open()`', function() {
		ASSERT(typeof VFS.open === "function");
	});

	it('`open("file://")` should open working filesystem based VFS', function(done) {
		return VFS.open("file://", function(err, vfs) {
			if (err) return done(err);
			ASSERT.equal(typeof vfs, "object");
			ASSERT.equal(
				vfs.readFileSync(__filename).toString(),
				FS.readFileSync(__filename).toString()
			);
			return done(null);
		});
	});

	it('`open("http://")` should open working proxy-based VFS', function(done) {
		var contentServer = HTTP.createServer(function (req, res) {
			ASSERT.equal(URL.parse(req.url).path, "/");
			ASSERT.equal(typeof req.headers["x-forwarded-for"], "string");
			res.end(FS.readFileSync(__filename));
		});
		return contentServer.listen(CONTENT_PORT, function() {
			return new VFS.ProxyFS("http://127.0.0.1:" + CONTENT_PORT).open(function(err, vfs) {
				if (err) return done(err);

				ASSERT.equal(typeof vfs, "object");

				return vfs.readFile("/", function(err, data) {
					if (err) return done(err);

					ASSERT.equal(data.toString(), FS.readFileSync(__filename).toString());

					return vfs.close(function() {
						return contentServer.close(done);
					});
				});
			});
		});
	});

	it("works for 'pinf-it-package-insight'", function(done) {

		FS.removeSync(PATH.join(__dirname, "../.rt"));

		return PINF.main(function(options, callback) {

			var opts = {
				test: true,
				rootPath: PATH.join(__dirname, "assets")
			};

			return VFS.open("file://" + opts.rootPath, opts, function(err, vfs) {
				if (err) return callback(err);

				options.$pinf._api.FS = vfs;

				ASSERT.equal(typeof vfs.on, "function");

				var usedPaths = {};
				function relpath(path) {
					if (!path || !opts.rootPath || !/^\//.test(path)) return path;
					return PATH.relative(opts.rootPath, path);
				}
				vfs.on("used-path", function(path) {
					usedPaths[relpath(path)] = true;
				});

				var path = PATH.join("packages", "package-a");
				return PACKAGE_INSIGHT.parse(path, options.$pinf.makeOptions(opts), function(err, descriptor) {
					if (err) return callback(err);

					ASSERT.equal(typeof descriptor, "object");
					ASSERT.equal(typeof descriptor.id, "string");
					ASSERT.equal(descriptor.dirpath, path);
					ASSERT.equal(typeof descriptor.combined, "object");

		            var json = JSON.stringify(Object.keys(usedPaths));
		            var output = JSON.parse(json);
		            if (MODE === "test") {
		                ASSERT.deepEqual(
		                    output,
		                    JSON.parse(FS.readFileSync(PATH.join(__dirname, "assets/results", "pinf-vfs-0.json")))
		                );
		            } else
		            if (MODE === "write") {
		                FS.outputFileSync(PATH.join(__dirname, "assets/results", "pinf-vfs-0.json"), JSON.stringify(output, null, 4));
		            } else {
		                throw new Error("Unknown `MODE`");
		            }

					return callback(null);
				});
			});
		}, module, done);
	});

});

