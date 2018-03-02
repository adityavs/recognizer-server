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

/* Combines related lines into line blocks */

const Lbs = function () {

};

module.exports = Lbs;

Lbs.prototype.getLineBlocks = function (page) {
	let lbs = [];
	
	for (let flow of page.flows) {
		for (let block of flow.blocks) {
			for (let i = 0; i < block.lines.length; i++) {
				let line1 = block.lines[i];
				let line2 = 0;
				if (i + 1 < block.lines.length) line2 = block.lines[i + 1];
				
				this.addLine(lbs, line1, line2);
			}
		}
	}
	
	//console.log(lbs);
	
	// for (let lb of lbs) {
	// 	for (let line of lb.lines) {
	// 		console.log(lb.maxFontSize, lb.dominatingFont, line.text);
	// 	}
	// 	console.log(' ');
	// 	console.log(' ');
	// }
	//
	return lbs;
};

Lbs.prototype.addLine = function (lbs, line, line2) {
	let that = this;
	let lineDominatingFont = this.getLineDominatingFont(line);
	let maxFontSize = this.getLineDominatingFontsize(line);
	let upper = this.isLineUpper(line);
	
	let n = lbs.length;
	if (n > 0) {
		n--;
		let tb = lbs[n];
		
		// Space between lines must be more or less equal. But <sup> can increase that space
		let skip = 0;
		if (line2 && Math.abs(((line.yMin - tb.yMax) - (line2.yMin - line.yMax))) > tb.maxFontSize / 3) skip = 1;
		
		let lfe = this.lineFontsEqual(line, tb.lines[tb.lines.length - 1]);
		
		let maxLineGap;
		
		if (tb.maxFontSize <= 12.0 && !tb.upper) {
			maxLineGap = tb.maxFontSize;
		}
		else {
			maxLineGap = tb.maxFontSize * 2.5;
		}
		
		function fn1() {
			if (skip) return 0;
			
			if (!(tb.upper === upper || (line.yMin - tb.yMax < tb.maxFontSize &&
					that.allowUpperNonupper(line, tb.lines[tb.lines.length - 1])))) return 0;
			
			if (!((lfe === 0 && (lineDominatingFont === tb.dominatingFont ||
					(tb.maxFontSize === maxFontSize && line.yMin - tb.yMax < tb.maxFontSize * 1))) ||
					lfe === 1)) return 0;
			
			
			if (!(line.words[0].bold === tb.bold)) return 0;
			
			if (!(Math.abs(tb.maxFontSize - maxFontSize) <= 1.0)) return 0;
			
			if (!(line.yMin - tb.yMax < maxLineGap)) return 0;
			
			if (!((line.xMin >= tb.xMin || Math.abs(line.xMin - tb.xMin) < 2.0) &&
					(line.xMax <= tb.xMax || Math.abs(line.xMax - tb.xMax) < 2.0) ||
					(line.xMin <= tb.xMin || Math.abs(line.xMin - tb.xMin) < 2.0) &&
					(line.xMax >= tb.xMax || Math.abs(line.xMax - tb.xMax) < 2.0))) return 0;
			
			
			tb.lines.push(line);
			if (line.xMin < tb.xMin) tb.xMin = line.xMin;
			if (line.yMin < tb.yMin) tb.yMin = line.yMin;
			if (line.xMax > tb.xMax) tb.xMax = line.xMax;
			if (line.yMax > tb.yMax) tb.yMax = line.yMax;
			
			return 1;
		}
		
		let res = fn1();
		
		if (res) return 1;

// if(upper) console.log(line1.text);
	}
	
	let lb = {
		lines: [line],
		yMin: line.yMin,
		yMax: line.yMax,
		xMin: line.xMin,
		xMax: line.xMax,
		maxFontSize,
		bold: line.words[0].bold,
		dominatingFont: lineDominatingFont,
		upper: upper,
	};
	
	lbs.push(lb);
};

Lbs.prototype.allowUpperNonupper = function (line1, line2) {
	for (let word1 of line1.words) {
		for (let word2 of line2.words) {
			if (word1.font === word2.font && word1.fontsize === word2.fontsize &&
				word1.yMax - word1.yMin === word2.yMax - word2.yMin) {
				return true
			}
		}
	}
	return false;
};

Lbs.prototype.lineFontsEqual = function (line1, line2) {
	
	let font1 = undefined;
	let font2 = undefined;
	if (!line1.words.length || !line2.words.length) return false;
	
	for (let word of line1.words) {
		if (font1 === undefined) {
			font1 = word.font;
		}
		else {
			if (word.font !== font1) {
				return 0;
			}
		}
	}
	
	for (let word of line2.words) {
		if (font2 === undefined) {
			font2 = word.font;
		}
		else {
			if (word.font !== font2) {
				return 0;
			}
		}
	}
	
	if (font1 === font2) return 1;
	
	return 2;
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

Lbs.prototype.getLineDominatingFontsize = function (line) {
	let fontsizes = {};
	for (let word of line.words) {
		if (!fontsizes[word.font]) {
			fontsizes[word.fontsize] = word.text.length;
		}
		else {
			fontsizes[word.fontsize] += word.text.length;
		}
	}
	
	let maxLength = 0;
	let maxLengthFontsize = -1;
	
	for (let fontsize in fontsizes) {
		let length = fontsizes[fontsize];
		if (length > maxLength) {
			maxLengthFontsize = fontsize;
			maxLength = length;
		}
	}
	
	return parseFloat(maxLengthFontsize);
};

Lbs.prototype.isLineUpper = function (line) {
	
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

