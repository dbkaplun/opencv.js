#!/usr/bin/env node

const execSync = require('child_process').execSync
const fs = require('fs')
const path = require('path')

const OPENCV_REPO = 'https://github.com/opencv/opencv'
const OPENCV_BRANCH = 'master'
const OUTFILE = 'dist/index.js'
const TMPDIR = path.join(__dirname, 'tmp')
const GLOBAL_NAME = '_opencvExports'
const BUILD_TYPE = 'MinSizeRel' // <Debug|RelWithDebInfo|Release|MinSizeRel>

function $ () {
  console.log('+', ...arguments) // simulate `set -x`
  return execSync.apply(this, arguments)
}

function buildOpenCV (repo, branch, outfile, tmpdir) {
  if (!tmpdir) tmpdir = TMPDIR
  $(`mkdir -p ${tmpdir}`)
  $(`git clone ${repo} ${tmpdir}`)
  let cwd = {cwd: tmpdir}
  $(`git checkout ${branch}`, cwd)
  // $(`emcmake .`, cwd) // doesn't work :'(
  let emscriptenRoot = $(`em-config EMSCRIPTEN_ROOT`).toString().trim()
  $(`cmake
       -DCMAKE_TOOLCHAIN_FILE="${emscriptenRoot}/cmake/Modules/Platform/Emscripten.cmake"
       -G "Unix Makefiles"
       -DCMAKE_BUILD_TYPE=${BUILD_TYPE}
       --build .`.replace(/\n\s*/g, ' '), cwd)

  // modified version of https://github.com/umdjs/umd/blob/95563fd6b46f06bda0af143ff67292e7f6ede6b7/templates/returnExportsGlobal.js
  const opencvEncoding = 'utf8';
  fs.writeFileSync(path.join(__dirname, outfile), `
(function (root, factory) {
  var GLOBAL_NAME = ${JSON.stringify(GLOBAL_NAME)};
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['exports'], function (exports) {
      root[GLOBAL_NAME] = factory(exports);
    });
  } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
    // CommonJS
    factory(exports);
  } else {
    // Browser globals
    root[GLOBAL_NAME] = factory({});
  }
}(this, function (exports) {
  ${fs.readFileSync(path.join(tmpdir, 'opencv/dist/js/opencv.js'), opencvEncoding)}
  exports.opencv = opencv;
}));
  `.trim())

  let version = fs.readFileSync(path.join(tmpdir, 'version_string.tmp'), opencvEncoding).match(/(Version control:.*?(\S*)\\n)?/m)[2] || $(`git rev-parse HEAD`, cwd).toString().trim()
  $(`rm -rf ${tmpdir}`)
  return version
}

function updateVersion (path, version) {
  let pkg = JSON.parse(fs.readFileSync(path))
  pkg.version = `${pkg.version.replace(/\+.*$/, '')}+${version}`
  fs.writeFileSync(path, `${JSON.stringify(pkg, null, '  ')}\n`)
  return pkg.version
}

if (require.main === module) {
  let version = buildOpenCV(OPENCV_REPO, OPENCV_BRANCH, OUTFILE)
  console.log(`built ${OUTFILE}`)
  let pkgVersion = updateVersion('package.json', version)
  console.log(pkgVersion)
}

// this is a build script but let's be a good citizen anyway
module.exports.buildOpenCV = buildOpenCV
module.exports.updateVersion = updateVersion
