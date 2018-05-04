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
const utils = require('./utils');

const Page = function () {
	
};

module.exports = Page;

/**
 * Tries to return the first page index (skips injected pages)
 * @param doc
 * @return {number}
 */
Page.prototype.getFirstPage = function (doc) {
	let firstPage = 0;
	let res;
	if (res = this.getFirstPageByWidth(doc)) {
		firstPage = res;
	}
	else if (res = this.getFirstPageByFonts(doc)) {
		firstPage = res;
	}
	
	return firstPage;
};

/**
 * Returns the first page index by comparing page fonts,
 * because some PDFs have additionally injected pages from publisher.
 * Injected pages often have different fonts than the rest
 * @param doc
 * @return {number}
 */
Page.prototype.getFirstPageByFonts = function (doc) {
	let startPage = 0;
	
	// At minimum 3 pages are necessary
	if (doc.pages.length < 3) return 0;
	
	// Loop until the third page from the end
	for (let pageIndex = 0; pageIndex + 2 < doc.pages.length; pageIndex++) {
		let page1 = doc.pages[pageIndex];
		let missing = 0;
		let total = 0;
		
		// Loop through all fonts in the first page
		for (let font1 in page1.fDist) {
			let found = 0;
			
			// Loop from the next page to the second page from the end
			for (let page2_i = pageIndex + 1; page2_i < doc.pages.length; page2_i++) {
				let page2 = doc.pages[page2_i];
				for (let font2 in page2.fDist) {
					total++;
					if (font1 === font2) {
						found = 1;
						break;
					}
				}
				if (found) break;
			}
			
			if (!found) {
				missing++;
			}
		}
		
		// If all fonts from one page are missing in the next two pages
		// then the page is injected
		if (missing === Object.keys(page1.fDist).length && total >= 2) {
			startPage = pageIndex + 1;
		}
	}
	
	return startPage;
};

/**
 * Returns the first page index by comparing page widths,
 * because some PDFs have additionally injected pages from publisher.
 * Injected pages often have a little bit different width than the rest
 * @param doc
 * @return {number}
 */
Page.prototype.getFirstPageByWidth = function (doc) {
	let firstPage = 0;
	
	// If document has only one page just return (0)
	if (doc.pages.length <= 1) return 0;
	
	// If document has two pages but their widths are different, return only the second page (1)
	if (doc.pages.length === 2 &&
		doc.pages[0].width !== doc.pages[1].width) {
		return 1;
	}
	
	// If document has three pages but only the second and the third have equal width, return the second (1)
	if (doc.pages.length === 3 &&
		doc.pages[0].width !== doc.pages[1].width &&
		doc.pages[1].width === doc.pages[2].width) {
		return 1;
	}
	
	// If there are at least 3 pages and all of them are different width,
	// then something is wrong with the PDF and don't use this method to detect the first page.
	if (doc.pages.length >= 3 && doc.pages[0].width !== doc.pages[1].width &&
		doc.pages[1].width !== doc.pages[2].width) {
		return 0;
	}
	
	if (doc.pages.length < 4) return 0;
	
	// Tries to find a sequence of pages where one page has a different width
	// than the next two pages
	for (let i = 0; i < doc.pages.length - 3; i++) {
		if (doc.pages[i].width !== doc.pages[i + 1].width &&
			doc.pages[i + 1].width === doc.pages[i + 2].width) {
			firstPage = i + 1;
		}
	}
	
	return firstPage;
};

/**
 * Extracts header and footer text by finding
 * repeated text in different pages but at the same position
 * @param doc
 * @return {string}
 */
Page.prototype.extractHeaderFooter = function (doc) {
	let text = '';
	
	for (let page_i = 0; page_i + 1 < doc.pages.length; page_i++) {
		let page = doc.pages[page_i];
		
		for (let block_i = 0; block_i < page.lines.length; block_i++) {
			let block = page.lines[block_i];
			
			if (block.yMin < 5 || block.yMax > page.height - 5) continue;
			if (block.text.toLowerCase().includes('download') || block.text.includes('http')) continue;
			// Only injected text can be at the top or bottom of the page
			// console.log('b1', block.text, block.xMin);
			
			for (let page2_i = page_i + 1; page2_i < doc.pages.length && page2_i <= page_i + 2; page2_i++) {
				let page2 = doc.pages[page2_i];
				
				for (let block2_i = 0; block2_i < page2.lines.length; block2_i++) {
					let block2 = page2.lines[block2_i];
					// console.log('b2', block2.text, block2.xMin);
					
					let width1 = block.xMax - block.xMin;
					let height1 = block.yMax - block.yMin;
					
					let width2 = block2.xMax - block2.xMin;
					let height2 = block2.yMax - block2.yMin;
					
					if (
						Math.abs(block.xMin - block2.xMin) < 10 &&
						Math.abs(block.yMin - block2.yMin) < 10 &&
						Math.abs(width1 - width2) < 10 &&
						Math.abs(height1 - height2) < 10) {
						
						let data1 = block.text;
						let data2 = block2.text;
						
						if (data1 === data2) {
							if (text.indexOf(data1) < 0) {
								text += data1 + '\n';
							}
						}
					}
				}
				
			}
		}
		
	}
	return text;
};

/**
 * Returns a page index and position after which no more title extraction or recognition should be proceeded.
 * I.e. title should never be below abstract, keywords, byline or table of contents
 * Otherwise there is an increase in recognition time (because more potential titles have to be evaluated),
 * and the results are more likely to be false positives.
 *
 * @param doc
 * @return {pageIndex, pageY}
 */
Page.prototype.getTitleBreakLine = function (doc) {
	let breakLine = null;
	
	(function () {
		for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
			let page = doc.pages[pageIndex];
			
			for (let lb of page.lbs) {
				let line = lb.lines[0];
				let text = line.text;
				text = text.toLowerCase();
				if (text === 'by' || text.indexOf('by ') === 0) {
					breakLine = {
						pageIndex,
						pageY: line.yMin
					};
					return;
				}
			}
		}
	})();
	
	(function () {
		for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
			let page = doc.pages[pageIndex];
			
			for (let line of page.lines) {
				if (/^(Keyword|KEYWORD|Key Word|Key word|Indexing Terms)/.test(line.text)) {
					if (!breakLine) {
						breakLine = {
							pageIndex,
							pageY: line.yMin
						};
					}
					else if (
						breakLine.pageIndex > pageIndex ||
						breakLine.pageIndex === pageIndex && breakLine.pageY > line.yMin) {
						breakLine.pageIndex = pageIndex;
						breakLine.pageY = line.yMin;
					}
					return;
				}
				
				if (utils.isBreakSection(line.text)) {
					if (!breakLine) {
						breakLine = {
							pageIndex,
							pageY: line.yMin
						};
					}
					else if (
						breakLine.pageIndex > pageIndex ||
						breakLine.pageIndex === pageIndex && breakLine.pageY > line.yMin) {
						breakLine.pageIndex = pageIndex;
						breakLine.pageY = line.yMin;
					}
					return;
				}
			}
			
		}
	})();
	
	return breakLine;
};

/**
 * Detect document language by analyzing language in multiple pages.
 * Journal articles can have an injected page which can distort
 * language detection results, or there can be an abstract
 * written in English while all other text is in a different language.
 * The function should overcome this by comparing results from different pages.
 * @param doc
 * @return {Promise<*>}
 */
Page.prototype.detectLanguage = async function (doc) {
	let lgs = {};
	for (let page of doc.pages) {
		let result = await utils.detectLanguage(page.text);
		if (!result) continue;
		
		// Gets byte length of UTF-8 page.text and calculates how many percent of the page is text bytes
		let percent = result.textBytes * 100 / Buffer.from(page.text).length;
		
		// At least 30% of the page must be text bytes and at least 50%
		// of the text must be in one language (it must dominate page)
		if (result.languages[0].percent < 50 || percent < 30) continue;
		
		// Calculate how many times each language were detected
		let lg = result.languages[0].code;
		if (!lgs[lg]) {
			lgs[lg] = 1;
		}
		else {
			lgs[lg]++;
		}
	}
	
	let lg = null;
	let lgCount = 0;
	
	// Find the most popular language and in how many pages it was detected
	for (let key in lgs) {
		let value = lgs[key];
		if (lgCount < value) {
			lg = key;
			lgCount = value;
		}
	}
	
	// If document has only one page, and language was detected, just return it
	// If document has two or more pages, the same language must be detected in at least two pages
	if (
		doc.pages.length === 1 && lgCount ||
		doc.pages.length >= 2 && lgCount >= 2
	) return lg;
	
	return null;
};
