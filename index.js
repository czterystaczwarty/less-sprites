#!/usr/bin/env node

var async = require('async');
var path = require('path');
var util = require('util');
var gm = require('gm');
var im = gm.subClass({ imageMagick: true });
var fs = require('fs');
var Q = require('q');


function Sprites() {
	this.specs = {
		appendRight: false,
	};
	this.readArgs();
}

Sprites.prototype.createSprite = function(sourceDir, sourceFiles, spriteName) {
	var readDir = false;
	if (sourceDir !== false) {
		this.sourceDir = sourceDir;
	} else {
		this.sourceDir = '.'; // default is current directory
		if (sourceFiles.length == 1) {
			if (!fs.existsSync(sourceFiles[0])) {
				throw new Error('Source file "' + sourceFiles[0] + '" does not exist.');
			}
			var stats = fs.statSync(sourceFiles[0]);
			if (stats.isDirectory()) {
				this.sourceDir = sourceFiles[0];
				sourceFiles = fs.readdirSync(this.sourceDir);
			}
		}
	}

	this.destFile = path.basename(spriteName);
	this.lessPath = this.sourceDir + '/' + path.basename(spriteName, '.png') + '.less';

	this.files = [];
	this.spriteFile = gm(1, 1, "#ffffffff");

	sourceFiles = this.getSourceFiles(sourceFiles);
	if (!sourceFiles.length) {
		throw new Error('No valid source files were provided.');
	}

	this.combine(sourceFiles)
		.then(function() {
			this.spriteFile.write(this.sourceDir + '/' + this.destFile, function(err) {
				if (err) throw err;
			});
			this.writeStyles();
		}.bind(this));
};

Sprites.prototype.getSourceFiles = function(files) {
	var file,
		sourceFiles = [];

	for (var i = 0, l = files.length; i < l; i++) {
		file = path.basename(files[i]);
		if (file.match(/.*\.png$/i) && file != this.destFile) {
			sourceFiles.push(file);
		}
	}

	return sourceFiles;
};

Sprites.prototype.combine = function(files) {
	var deferred = Q.defer();
	async.each(files, this.processFile.bind(this), function(err) {
		if (err) {
			deferred.reject(new Error(err));
		} else {
			deferred.resolve();
		}
	});
	return deferred.promise;
};

Sprites.prototype.processFile = function(fileName, callback) {
	var filePath = this.sourceDir + '/' + fileName;
	if (!fs.existsSync(filePath)) {
		throw new Error('Source file "' + filePath + '" does not exist.');
	}
	im(filePath).size(function(err, size) {
		if (err) throw err;
		this.spriteFile.append(filePath, this.specs.appendRight);
		this.files.push({
			name: fileName,
			size: size,
		});
		callback();
	}.bind(this));
};

Sprites.prototype.writeStyles = function() {
	var spriteFile = this.destFile;
	var sprite = path.basename(this.destFile, '.png');
	var content = '';
	var x = 0;
	var y = 0;

	for (var i = 0, l = this.files.length; i < l; i++) {
		content += util.format(
			'.sprite("%s", "%s", @_spriteDir) {\n\tbackground-image: url("@{_spriteDir}%s");\n\tbackground-position: %dpx %dpx;\n}\n',
			sprite, this.files[i].name, spriteFile, x, y
		);
		content += util.format(
			'.sprite("%s", @_spriteDir) {\n\tbackground-image: url("@{_spriteDir}%s");\n\tbackground-position: %dpx %dpx;\n}\n',
			this.files[i].name, spriteFile, x, y
		);
		if (this.specs.appendRight) {
			x -= this.files[i].size.width;
		} else {
			y -= this.files[i].size.height;
		}
	}

	content += '.sprite (@_) {\n' +
		'\t@path: e(@_);\n' +
		'\t@spriteDir: `"@{path}".match(/^(.*\\/)([^\\/]*)$/)[1]`;\n' +
		'\t@imgName: `"@{path}".match(/^(.*\\/)([^\\/]*)$/)[2]`;\n' +
		'\t.sprite(@imgName, @spriteDir);\n' +
		'}\n' +
		'.sprite(\'sprite-img\', @_) {\n' +
		'\t.sprite("sprite-img", @_);\n' +
		'}\n' +
		'.sprite("sprite-img", @_) {\n' +
		'\t@path: e(@_);\n' +
		'\t@spriteDir: `"@{path}".match(/^(.*\\/)([^\\/]*)$/)[1]`;\n' +
		'\t@imgName: `"@{path}".match(/^(.*\\/)([^\\/]*)$/)[2]`;\n' +
		'\t.sprite("sprite-img", @imgName, @spriteDir);\n' +
		'}\n';

	fs.writeFile(this.lessPath, content, function(err) {
		if (err) throw err;
	});
};

Sprites.prototype.readArgs = function() {
	var argv = process.argv.splice(2);

	if (!argv.length || argv[0] == '-h' || argv[0] == '--help') {
		this.printUsage();
		process.exit();
	}

	var specsFile = argv[0];
	if (!fs.existsSync(specsFile)) {
		console.log('Error: Specs file "' + specsFile + '" does not exist.');
		process.exit();
	}
	specsFile =  path.resolve(specsFile);
	var specs = require(specsFile);
	if (!specs['dir']) {
		specs['dir'] = '.';
	}
	if (!specs['sprite']) {
		specs['sprite'] = path.basename(specsFile, '.json') + '.png';
	}
	if (!specs['files']) {
		throw new Error('Missing "files" property.');
	}
	if (specs['direction']) {
		this.specs.appendRight = specs['append'] == 'right';
	}
	this.createSprite(
		path.resolve(specsFile, '..', specs.dir),
		specs.files,
		specs.sprite
	);
};

Sprites.prototype.printUsage = function() {
	console.log('Usage: less-sprites sprite-specs.json');
};

new Sprites();
