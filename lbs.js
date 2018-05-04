/*
 ***** BEGIN LICENSE BLOCK *****
 
 This file is part of the Zotero Data Server.
 
 Copyright © 2018 Center for History and New Media
 George Mason University, Fairfax, Virginia, USA
 http://zotero.org
 
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.
 
 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 
 ***** END LICENSE BLOCK *****
 */

const Lbs = function () {

};

module.exports = Lbs;

/**
 * Group text lines by their purpose. I.e. Title lines, paragraph lines
 */
Lbs.prototype.getLineBlocks = function (page) {
	let lbs = [];
	
	for (let i = 0; i < page.lines.length; i++) {
		let line1 = page.lines[i];
		let line2 = null;
		if (i + 1 < page.lines.length && page.lines[i + 1].yMin > page.lines[i].yMax) {
			line2 = page.lines[i + 1];
		}
		
		this.addLine(lbs, line1, line2);
	}
	
	//console.log(lbs);
	
	// for (let lb of lbs) {
	// 	for (let line of lb.lines) {
	// 		console.log(lb.maxFontSize, lb.dominatingFont, line.yMax - line.yMin, line.text);
	// 	}
	// 	console.log(' ');
	// 	console.log(' ');
	// }
	
	return lbs;
};

Lbs.prototype.addLine = function (lbs, line, lineNext) {
	let dominatingFont = this.getLineDominatingFont(line);
	let maxFontSize = this.getLineDominatingFontSize(line);
	let upper = this.isLineUpper(line);
	
	if (lbs.length) {
		let lb = lbs.slice(-1)[0];
		
		let linePrev = lb.lines.slice(-1)[0];
		let lineSpacing = line.yMin - linePrev.yMax;
		
		// Line spacing between the previous, the current and the next line (if exists) must be similar
		// if dominating fonts are different
		let allowLineSpacing = true;
		if (lineNext) {
			let lineSpacingNext = lineNext.yMin - line.yMax;
			allowLineSpacing = lineSpacing < lineSpacingNext + lb.maxFontSize / 2;
		}
		
		
		// Usually text block is either UPPERCASE or LOWERCASE, but sometimes they can be mixed
		// i.e. UPPERCASE title that contains italic lowercase latin term which is in a new line
		let allowUpperLower = true;
		if (lb.upper !== upper) {
			allowUpperLower = lineSpacing < lb.maxFontSize && this.haveIdenticalLineHeight(line, linePrev);
		}
		
		// Lines must have all or at least some identical font words
		let allowFont;
		if (this.allWordsHaveIdenticalFont(line) && this.allWordsHaveIdenticalFont(linePrev)) {
			allowFont = line.words[0].font === linePrev.words[0].font;
		}
		else {
			allowFont = dominatingFont === lb.dominatingFont || this.haveIdenticalFontWords(line, linePrev);
		}
		
		// Both are either bold or not bold
		let allowBold = line.words[0].bold === lb.bold;
		
		// Have similar font size or at least some identical size words
		let allowFontSize = Math.abs(lb.maxFontSize - maxFontSize) <= 1.0 ||
			this.haveIdenticalFontSizeWords(line, linePrev);
		
		// Line spacing isn't too big
		let maxLineSpacing = lb.maxFontSize;
		if (lb.maxFontSize > 12.0 || lb.upper) maxLineSpacing = lb.maxFontSize * 2.5;
		let allowMaxLineSpacing = lineSpacing < maxLineSpacing;
		
		// Lines must be aligned or centered on a similar axis or at least some part of them must overlap
		let combineOverlapping =
			(line.xMin >= lb.xMin || Math.abs(line.xMin - lb.xMin) < 20.0) &&
			(line.xMax <= lb.xMax || Math.abs(line.xMax - lb.xMax) < 20.0) ||
			(line.xMin <= lb.xMin || Math.abs(line.xMin - lb.xMin) < 20.0) &&
			(line.xMax >= lb.xMax || Math.abs(line.xMax - lb.xMax) < 20.0);
		
		if (allowLineSpacing && allowUpperLower && allowFont &&
			allowBold && allowFontSize && allowMaxLineSpacing && combineOverlapping) {
			// Push the line to the existing lines block if passed all checks
			lb.lines.push(line);
			if (line.xMin < lb.xMin) lb.xMin = line.xMin;
			if (line.yMin < lb.yMin) lb.yMin = line.yMin;
			if (line.xMax > lb.xMax) lb.xMax = line.xMax;
			if (line.yMax > lb.yMax) lb.yMax = line.yMax;
			return 1;
		}
	}
	
	// Push a new line block if it's the first line or it doesn't combine with the previous one
	let lb = {
		lines: [line],
		yMin: line.yMin,
		yMax: line.yMax,
		xMin: line.xMin,
		xMax: line.xMax,
		maxFontSize,
		bold: line.words[0].bold,
		dominatingFont: dominatingFont,
		upper: upper,
	};
	
	lbs.push(lb);
};

Lbs.prototype.haveIdenticalFontWords = function (line1, line2) {
	for (let word1 of line1.words) {
		if (word1.text.length < 2) continue;
		for (let word2 of line2.words) {
			if (word2.text.length < 2) continue;
			if (word1.font === word2.font) {
				return true
			}
		}
	}
	return false;
};

Lbs.prototype.haveIdenticalFontSizeWords = function (line1, line2) {
	for (let word1 of line1.words) {
		if (word1.text.length < 2) continue;
		for (let word2 of line2.words) {
			if (word2.text.length < 2) continue;
			if (word1.fontSize === word2.fontSize) {
				return true
			}
		}
	}
	return false;
};

Lbs.prototype.haveIdenticalLineHeight = function (line1, line2) {
	return (line1.yMax - line1.yMin) === (line2.yMax - line2.yMin);
};

Lbs.prototype.allWordsHaveIdenticalFont = function (line) {
	return line.words.length && line.words.every(x => x.font === line.words[0].font);
};

Lbs.prototype.getLineDominatingFont = function (line) {
	let fonts = {};
	for (let word of line.words) {
		if (!fonts[word.font]) {
			fonts[word.font] = word.text.length;
		}
		else {
			fonts[word.font] += word.text.length;
		}
	}
	
	let maxLength = 0;
	let maxLengthFont = -1;
	
	for (let font in fonts) {
		let length = fonts[font];
		if (length > maxLength) {
			maxLengthFont = font;
			maxLength = length;
		}
	}
	
	return maxLengthFont;
};

Lbs.prototype.getLineDominatingFontSize = function (line) {
	let fontSizes = {};
	for (let word of line.words) {
		if (!fontSizes[word.fontSize]) {
			fontSizes[word.fontSize] = word.text.length;
		}
		else {
			fontSizes[word.fontSize] += word.text.length;
		}
	}
	
	let maxLength = 0;
	let maxLengthFontSize = -1;
	
	for (let fontSize in fontSizes) {
		let length = fontSizes[fontSize];
		if (length > maxLength) {
			maxLengthFontSize = fontSize;
			maxLength = length;
		}
	}
	
	return parseFloat(maxLengthFontSize);
};

Lbs.prototype.isLineUpper = function (line) {
	
	// Todo: Make upper case line detection more correct
	if (line.text.length <= 5) return false;
	
	let total = 0;
	let upper = 0;
	
	for (let word of line.words) {
		for (let c of word.text) {
			total++;
			if (c.toUpperCase() === c) upper++;
		}
	}
	
	if (!total) return false;
	if (upper * 100 / total >= 90) return true;
	
	return false;
};
