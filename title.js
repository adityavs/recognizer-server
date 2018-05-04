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

let areg1 = XRegExp('[\\p{Letter}]');

const Title = function (options) {
	this.db = options.db;
	this.authors = options.authors;
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

Title.prototype.getFontSizeThreshold = function (page) {
	let minFontSize = 0;
	
	for (let fontSize in page.fsDist) {
		fontSize = parseFloat(fontSize);
		let fontcount = page.fsDist[fontSize];
		if (fontcount > 400 && minFontSize < fontSize) minFontSize = fontSize;
	}
	
	if (minFontSize) {
		return minFontSize + 1;
	}
	
	let d = Object.keys(page.fsDist).map(function (value) {
		return parseFloat(value);
	});
	if (!d.length) return 0;
	d.sort();
	return d.pop();
};

/**
 * Checks if line block has enough free space around it
 */
Title.prototype.isVisuallySeparated = function (lbs, i) {
	// Previous line block
	let lb_prev = 0;
	if (i > 0) lb_prev = lbs[i - 1];
	
	// Current line block
	let lb = lbs[i];
	
	// Next line block
	let lb_next = 0;
	if (i + 1 < lbs.length) lb_next = lbs[i + 1];
	
	// If there is no another line block before (or after) or the line spacing is higher than both font sizes
	let freeSpaceBefore = !lb_prev || lb.yMin - lb_prev.yMax > Math.max(lb.maxFontSize, lb_prev.maxFontSize);
	let freeSpaceAfter = !lb_next || lb_next.yMin - lb.yMax > Math.max(lb.maxFontSize, lb_next.maxFontSize);
	
	return freeSpaceBefore || freeSpaceAfter;
};

Title.prototype.wordsCount = function (title) {
	return title.split(' ').filter(x => x).length;
};

Title.prototype.cleanTitle = function (title) {
	return title.replace(/[*1]$/, '');
};

Title.prototype.hasQuoteMarks = function (title) {
	return /["'\u2018\u2019\u201c\u201d\u0060\u00b4]/.test(title[0]) &&
		/["'\u2018\u2019\u201c\u201d\u0060\u00b4]/.test(title.slice(-1));
};

/**
 * Extracts title and authors.
 * Tries to find title and authors nearby
 *
 * @param page
 * @param breakPageY
 * @return {Promise<*>}
 */
Title.prototype.getTitleAndAuthors = async function (page, breakPageY) {
	let lbs = page.lbs;
	let font_size_threshold = this.getFontSizeThreshold(page);
	
	// Sort line blocks by their maxFontSize. Usually the biggest
	// block is the title
	let lbsSorted = lbs.slice().sort((a, b) => b.maxFontSize - a.maxFontSize);
	
	for (let i = 0; i < lbsSorted.length; i++) {
		let tlb = lbsSorted[i];
		
		if (breakPageY !== null && tlb.yMin >= breakPageY) continue;
		
		if (tlb.maxFontSize < font_size_threshold) continue;
		
		let title = this.lineBlockToText(tlb, 0);
		
		if (title.length < 25 || title.length > 400) continue;
		
		// At least two words
		if (this.wordsCount(title) < 2) continue;
		
		if (this.getAlphabeticPercent(title) < 60) continue;
		
		if (this.hasQuoteMarks(title)) continue;
		
		//if (!tlb.upper && tlb.maxFontSize < font_size_threshold && tlb.yMin > page.height / 3) continue;
		
		let authors = await this.authors.extractAuthorsNearTitle(lbs, lbs.indexOf(tlb));
		if (authors.length) {
			title = this.cleanTitle(title);
			return {title, authors};
		}
	}
	
	// Try unsorted line blocks, but only for uppercase titles
	for (let i = 0; i < lbs.length; i++) {
		let tlb = lbs[i];
		
		if (breakPageY !== null && tlb.yMin >= breakPageY) continue;
		
		if (!tlb.upper) continue;
		
		// Converts line block lines to a single textline
		let title = this.lineBlockToText(tlb, 0);
		
		if (title.length < 20 || title.length > 400) continue;
		
		// At least 60% of characters are alphabetic
		if (this.getAlphabeticPercent(title) < 60) continue;
		
		// At least two words
		if (this.wordsCount(title) < 2) continue;
		
		if (!this.isVisuallySeparated(lbs, i)) continue;
		
		if (this.hasQuoteMarks(title)) continue;
		
		let authors = await this.authors.extractAuthorsNearTitle(lbs, i);
		if (authors.length) {
			title = this.cleanTitle(title);
			return {title, authors};
		}
	}
	
	return null;
};

Title.prototype.getAuthorsNearExistingTitle = async function (doc, existingTitle) {
	for (let page of doc.pages) {
		let lbs = page.lbs;
		
		existingTitle = utils.normalize(existingTitle);
		
		for (let i = 0; i < lbs.length; i++) {
			let tlb = lbs[i];
			
			let title = this.lineBlockToText(tlb, 0);
			let titleNorm = utils.normalize(title);
			if (titleNorm.indexOf(existingTitle) < 0) continue;
			
			let authors = await this.authors.extractAuthorsNearTitle(lbs, i);
			if (authors.length) {
				return authors;
			}
		}
	}
	return null;
};

Title.prototype.lineBlockToText = function (lb, m) {
	let text = '';
	for (let i = m; i < lb.lines.length; i++) {
		if (text) text += ' ';
		text += lb.lines[i].text;
	}
	return text;
};

/**
 * Resolve title to DOI
 * Loops through line blocks, normalizes, calculates hash and tries to find DOI in database
 */
Title.prototype.findDoiByTitle = async function (doc, breakLine) {
	let count = 0;
	
	let normText = utils.normalize(doc.text);
	
	let pages = doc.pages;
	
	// Tries to resolve DOI only in first two pages
	for (let pageIndex = 0; pageIndex < pages.length && pageIndex < 2; pageIndex++) {
		let page = pages[pageIndex];
		let lbs = page.lbs;
		
		if (breakLine && pageIndex > breakLine.pageIndex) break;
		
		let foundDois = [];
		
		for (let i = 0; i < lbs.length; i++) {
			let lb = lbs[i];
			
			if (breakLine && pageIndex === breakLine.pageIndex && lb.yMin >= breakLine.pageY) continue;
			
			let title = this.lineBlockToText(lb, 0);
			if (count > 100) break;
			
			for (let m = 0; m < lb.lines.length && m < 2; m++) {
				if (lb.lines.length - m > 7) continue;
				let title = this.lineBlockToText(lb, m);
				let normTitle = utils.normalize(title);
				if (normTitle.length < 15 || normTitle.length > 300) continue;
				count++;
				let doi = await this.db.getDoiByTitle(normTitle, normText);
				if (doi) {
					foundDois.push(doi);
					if (foundDois.length >= 2) return null;
				}
			}
			
			// Try to combine title from two line blocks. Useful when:
			// 1) Line grouping to blocks fails (in lbs.js) and title
			// becomes separated into two line blocks
			// 2) There is a subtitle which must be included to title because
			// in our database it exist in full name (title+subtitle)
			if (i + 1 < lbs.length) {
				let curLb = lbs[i];
				let nextLb = lbs[i + 1];
				
				// Line block is in the first 1/3 of page
				if (curLb.yMin > page.height / 3) continue;
				
				// Maximum 6 combined lines
				if (curLb.lines.length + nextLb.lines.length > 6) continue;
				
				let title = this.lineBlockToText(curLb, 0) + ' ' + this.lineBlockToText(nextLb, 0);
				
				let normTitle = utils.normalize(title);
				if (normTitle.length < 15 || normTitle.length > 300) continue;
				
				count++;
				let doi = await this.db.getDoiByTitle(normTitle, normText);
				if (doi) {
					foundDois.push(doi);
					if (foundDois.length >= 2) return null;
				}
			}
			
		}
		if (foundDois.length) return foundDois[0];
	}
	return null;
};
