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

const log = require('./log');
const XRegExp = require('xregexp');
const utils = require('./utils');
const Authors = require('./authors');

let areg1 = XRegExp('[\\p{Letter}]');

const Title = function (options) {
	this.db = options.db;
	this.authors = new Authors({db: this.db});
};

module.exports = Title;

Title.prototype.getAlphabeticPercent = function (text) {
	if (!text.length) return 0;
	let alphabetic = 0;
	for (let c of text) {
		if (areg1.test(c)) alphabetic++;
	}
	return alphabetic * 100 / text.length;
};

Title.prototype.get_average_font_size_threshold = function (page) {
	let min_font_size = 0;
	
	for (let fontsize in page.fsDist) {
		fontsize = parseFloat(fontsize);
		let fontcount = page.fsDist[fontsize];
		if (fontcount > 500 && min_font_size < fontsize) min_font_size = fontsize;
	}
	
	return min_font_size + 1;
};

Title.prototype.isVisuallySeparated = function (lbs, i) {
	let lb_prev = 0;
	if (i > 0) lb_prev = lbs[i - 1];
	let lb = lbs[i];
	let lb_next = 0;
	if (i + 1 < lbs.length) lb_next = lbs[i + 1];
	let before = 1;
	let after = 1;
	if (lb_prev && lb.yMin - lb_prev.yMax < Math.max(lb.maxFontSize, lb_prev.maxFontSize)) before = 0;
	if (lb_next && lb_next.yMin - lb.yMax < Math.max(lb.maxFontSize, lb_next.maxFontSize)) after = 0;
	if (!before && !after) return 0;
	return 1;
};

Title.prototype.cleanTitle = function (title) {
	return title.replace(/[*1]$/, '');
};

Title.prototype.getTitleAuthor = async function (page, breakPageY) {
	let lbs = page.lbs;
	let font_size_threshold = this.get_average_font_size_threshold(page);
	let lbsSorted = lbs.slice();
	lbsSorted.sort(function (a, b) {
		if (a.maxFontSize > b.maxFontSize) return -1;
		if (a.maxFontSize < b.maxFontSize) return 1;
		return 0;
	});
	
	for (let i = 0; i < lbsSorted.length; i++) {
		let tlb = lbsSorted[i];
		
		if (breakPageY !== null && tlb.yMin >= breakPageY) continue;
		
		if (tlb.maxFontSize < font_size_threshold) continue;
		
		let title = this.lineBlockToText(tlb, 0);
		
		if (title.length < 25 || title.length > 400) continue;
		
		if (this.getAlphabeticPercent(title) < 60) continue;
		
		if (!tlb.upper && tlb.maxFontSize < font_size_threshold && tlb.yMin > page.height / 3) continue;
		
		let authors = await this.authors.extractAuthors(lbs, lbs.indexOf(tlb));
		if (authors.length) {
			log.debug("extracted1", title, authors);
			title = this.cleanTitle(title);
			return {title, authors};
		}
	}
	
	for (let i = 0; i < lbs.length; i++) {
		let tlb = lbs[i];
		
		if (breakPageY !== null && tlb.yMin >= breakPageY) continue;
		
		if (!tlb.upper) continue;
		
		let title = this.lineBlockToText(tlb, 0);
		
		if (title.length < 20 || title.length > 400) continue;
		if (this.getAlphabeticPercent(title) < 60) continue;
		
		if (!this.isVisuallySeparated(lbs, i)) continue;
		
		let authors = await this.authors.extractAuthors(lbs, i);
		if (authors.length) {
			log.debug("extracted2", title, authors);
			title = this.cleanTitle(title);
			return {title, authors};
		}
	}
	
	return null;
};


Title.prototype.skipBlock = function (lbs, lbi) {
	let curLb = lbs[lbi];
	for (let i = lbi - 1; i > 0 && lbi - i < 5; i--) {
		let prevLb = lbs[i];
		if (prevLb.xMax < curLb.xMin || prevLb.xMin > curLb.xMax) continue;
		if (prevLb.maxFontSize > curLb.yMin - prevLb.yMax) return true;
	}
	return false;
};

Title.prototype.lineBlockToText = function (lb, m) {
	let text = '';
	for (let i = m; i < lb.lines.length; i++) {
		if (text) text += ' ';
		text += lb.lines[i].text;
	}
	return text;
};

Title.prototype.getDoi = async function (doc, breakLine) {
	let count = 0;
	
	let normText = utils.normalize(doc.text);
	
	let pages = doc.pages;
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
		let page = pages[pageIndex];
		let lbs = page.lbs;
		
		if (breakLine && pageIndex > breakLine.pageIndex) break;
		
		for (let i = 0; i < lbs.length; i++) {
			let gb = lbs[i];
			
			if (breakLine && pageIndex === breakLine.pageIndex && gb.yMin >= breakLine.pageY) continue;
			
			let title = this.lineBlockToText(gb, 0);
			// console.log('tttt1', title);
			if (count > 100) break;
			//if (this.skipBlock(lbs, i)) continue; // todo: fix
			
			for (let m = 0; m < gb.lines.length && m < 2; m++) {
				if (gb.lines.length - m > 7) continue;
				let title = this.lineBlockToText(gb, m);
				// console.log('title1', title);
				let normTitle = utils.normalize(title);
				if (normTitle.length < 15 || normTitle.length > 300) continue;
				count++;
				let doi = await this.db.getDoiByTitle(normTitle, normText);
				if (doi) {
					log.debug("found doi1", doi);
					return doi;
				}
			}
			
			if (i + 1 < lbs.length) {
				let curLb = lbs[i];
				let nextLb = lbs[i + 1];
				if (curLb.yMin > page.height / 3) continue;
				if (curLb.lines.length + nextLb.lines.length > 6) continue;
				let title = this.lineBlockToText(curLb, 0);
				title += this.lineBlockToText(nextLb, 0);
				// console.log('title2', title);
				let normTitle = utils.normalize(title);
				if (normTitle.length < 15 || normTitle.length > 300) continue;
				count++;
				let doi = await this.db.getDoiByTitle(normTitle, normText);
				if (doi) {
					log.debug("found doi2", doi);
					return doi;
				}
			}
		}
	}
	return null;
};
