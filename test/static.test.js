/*global specify*/
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var concatStream = require("concat-stream");
var browserify = require("browserify");
var jsdom = require("jsdom").jsdom;
var jadeify = require("../");

function staticPath(fileName) {
    return path.resolve(__dirname, "static", fileName);
}

function prepareBundle(jsEntryName, bundleOptions, preparationOptions) {
    var bundle = browserify();

    if (!preparationOptions || !preparationOptions.dontTransform) {
        bundle = bundle.transform(jadeify, bundleOptions);
    }

    return bundle.add(staticPath(jsEntryName));
}

specify("It gives the desired output", function (done) {
    testOutputMatches("test1", done, {static: true,
        locals: { pageTitle: "Jade", youAreUsingJade: true }
    });
});

specify("It emits stream error when Jade fails to process template", function (done) {
    testOutputErrors("test2", done, {static: true});
});

specify("It can be configured with package.json", function (done) {
    testOutputMatches("test3", done, undefined, {
        static: true,
        dontTransform: true,
        locals: {
            foo: function () { return "FOO!"; }
        }
    });
});

specify("It can handle functions using `self` instead of `locals`", function (done) {
    testOutputMatches("test4", done, {
        static: true,
        locals: {
            foo: function () { return "FOO!"; }
        }
    });
});

specify("It uses options from js", function (done) {
    testOutputMatches("test5", done, {
        static: true,
        self: true,
        locals: {
            foo: function () { return "FOO!"; }
        }
    });
});

specify("It should emit all files in dependency tree", function (done) {
    testFileEmit("test6", done, {
        static: true,
        self: true,
        locals: {
            foo: function () { return "FOO!"; }
        }
    });
});
specify("It should handle included Jade correctly", function (done) {
    testOutputMatches("test6", done, {
        static: true,
        self: false,
        locals: {
            pageTitle: "Jade",
            youAreUsingJade: true,
            foo: function () { return "FOO!"; }
        }
    });

});

function testOutputMatches(testDir, done, bundleOptions, preparationOptions) {
    process.chdir(staticPath(testDir));

    var bundleStream = prepareBundle(testDir + "/entry.js", bundleOptions, preparationOptions).bundle();
    var pageHtml = fs.readFileSync(staticPath(testDir + "/index.html"), "utf8");
    var desiredOutput = fs.readFileSync(staticPath(testDir + "/desired-output.txt"), "utf8").trim();

    bundleStream.pipe(concatStream(function (bundleJs) {
        var window = jsdom(pageHtml).defaultView;

        var scriptEl = window.document.createElement("script");
        scriptEl.textContent = bundleJs;
        window.document.head.appendChild(scriptEl);

        assert.equal(window.document.body.innerHTML, desiredOutput);

        done();
    }));
}

function testOutputErrors(testDir, done) {
    process.chdir(staticPath(testDir));

    var bundle = prepareBundle(testDir + "/entry.js");
    var stream = bundle.bundle();

    stream.on("error", function (error) {
        assert(error instanceof Error, "Must emit Error object.");
        done();
    })
    .pipe(concatStream(function (bundleJs) {
        assert(false, "Must emit \"error\".");
        done();
    }));
}

function testFileEmit(testDir, done) {
    process.chdir(staticPath(testDir));

    var bundle = prepareBundle(testDir + "/entry.js");
    var stream = bundle.bundle();
    var dependencyList = [];

    bundle.on("transform", function (tr, file) {
        tr.on("file", function (file) {
            dependencyList.push(path.basename(file));
        });
    });

    stream.pipe(concatStream(function (bundleJs) {
        assert(bundleJs, "Must create bundle as expected.");
        assert.deepEqual(dependencyList, ["header.jade", "footer.jade"]);
        done();
    }));
}
