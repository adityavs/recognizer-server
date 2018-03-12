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

const Page = function () {
	
};

module.exports = Page;

Page.prototype.getInfo = function (doc) {
	let firstPage = 0;
	let res;
	res = this.getFirstPageByWidth(doc);
	if (res) {
		firstPage = res;
	}
	else {
		res = this.getFirstPageByFonts(doc);
		if (res) {
			firstPage = res;
		}
	}
	
	let first = 1;
	let last = doc.totalPages;
	
	// res = this.extractPages(doc);
	//
	// if (res) {
	// 	let start = res.start;
	// 	first = res.first;
	// 	if (first === 1) {
	// 		firstPage = start;
	// 	}
	// 	else if (first === 2 && start >= 1) {
	// 		firstPage = start - 1;
	// 		first = 1;
	// 	}
	//
	// 	last = first + doc.totalPages - firstPage - 1;
	//
	// 	log.debug("pages:", doc.totalPages, start, first, last);
	// }
	
	let pages;
	
	if (!pages) {
		if (first > 1) {
			pages = first + '-' + last;
		}
		else {
			pages = last.toString();
		}
	}
	
	return {
		firstPage,
		pages
	};
};

Page.prototype.getFirstPageByFonts = function (doc) {
	let start_page = 0;
	
	if (doc.pages.length < 3) return 0;
	
	for (let page_i = 0; page_i + 2 < doc.pages.length; page_i++) {
		let page1 = doc.pages[page_i];
		let missing = 0;
		let total = 0;
		
		for (let font1 in page1.fDist) {
			let found = 0;
			
			for (let page2_i = page_i + 1; page2_i < doc.pages.length; page2_i++) {
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
		
		if (missing === Object.keys(page1.fDist).length && total >= 2) {
			start_page = page_i + 1;
		}
	}
	
	return start_page;
};

Page.prototype.getFirstPageByWidth = function (doc) {
	let first_page = 0;
	
	if (doc.pages.length <= 1) return 0;
	
	if (doc.pages.length === 2 &&
		doc.pages[0].width !== doc.pages[1].width) {
		return 1;
	}
	
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
	
	for (let i = 0; i < doc.pages.length - 3; i++) {
		if (doc.pages[i].width !== doc.pages[i + 1].width &&
			doc.pages[i + 1].width === doc.pages[i + 2].width) {
			first_page = i + 1;
		}
	}
	
	return first_page;
};

Page.prototype.extractPages = function (doc) {
	let start = 0;
	let first = 0;
	for (let page_i = 0; page_i + 2 < doc.pages.length; page_i++) {
		let page = doc.pages[page_i];
		
		for (let flow_i = 0; flow_i < page.flows.length; flow_i++) {
			let flow = page.flows[flow_i];
			
			for (let block_i = 0; block_i < flow.blocks.length; block_i++) {
				let block = flow.blocks[block_i];
				
				for (let line_i = 0; line_i < block.lines.length; line_i++) {
					let line = block.lines[line_i];
					if (line.yMax < 100 || line.yMin > page.height - 100) {
						
						for (let word_i = 0; word_i < line.words.length; word_i++) {
							let word = line.words[word_i];
							
							if (
								!(Math.abs(page.contentLeft - word.xMin) < 5.0 ||
									Math.abs(page.contentRight - word.xMax) < 5.0 ||
									Math.abs((page.contentRight - page.contentLeft) / 2 -
										(word.xMin + (word.xMax - word.xMin) / 2)) < 5.0))
								continue;
							
							let page2 = doc.pages[page_i + 2];
							
							for (let flow2_i = 0; flow2_i < page2.flows.length; flow2_i++) {
								let flow2 = page2.flows[flow2_i];
								
								for (let block2_i = 0; block2_i < flow2.blocks.length; block2_i++) {
									let block2 = flow2.blocks[block2_i];
									
									for (let line2_i = 0; line2_i < block2.lines.length; line2_i++) {
										let line2 = block2.lines[line2_i];
										if (line2.yMax < 100 || line2.yMin > page2.height - 100) {
											
											for (let word2_i = 0; word2_i < line2.words.length; word2_i++) {
												let word2 = line2.words[word2_i];
												
												if (
													Math.abs(word.yMin - word2.yMin) < 1.0 &&
													Math.abs(word.xMin - word2.xMin) < 15.0) {
													//log_debug("detected: %s %s\n", word->text, word2->text);
													
													let w1;
													let w2;
													
													let n;
													
													n = 0;
													
													let skip = 0;
													
													for (let i = 0; i < word.text.length && n < 30; i++) {
														if (word.text[i] < '0' || word.text[i] > '9') {
															skip = 1;
															break;
														}
													}
													
													n = 0;
													for (let i = 0; i < word2.text.length && n < 30; i++) {
														if (word2.text[i] < '0' || word2.text[i] > '9') {
															skip = 1;
															break;
														}
													}
													
													if (skip) continue;
													
													w1 = word.text;
													w2 = word2.text;
													
													console.log(w1, w2);
													
													let nr1 = parseInt(w1);
													let nr2 = parseInt(w2);
//                        log_debug("found numbers: %d %d\n", nr1, nr2);
													if (nr1 > 0 && nr2 === nr1 + 2) {
														//console.log("found numbers:", nr1, nr2);
														start = page_i;
														first = nr1;
														return {
															start, first
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
	
	return null;
};

Page.prototype.extract_header_footer = function (doc) {
	let text = '';
	
	for (let page_i = 0; page_i + 1 < doc.pages.length; page_i++) {
		let page = doc.pages[page_i];
		
		for (let flow_i = 0; flow_i < page.flows.length; flow_i++) {
			let flow = page.flows[flow_i];
			
			for (let block_i = 0; block_i < flow.blocks.length; block_i++) {
				let block = flow.blocks[block_i];
				
				// Only injected text can be at the top or bottom of the page
				if (block.yMin < 15 || block.yMax > page.height - 15) continue;
				
				for (let page2_i = page_i + 1; page2_i < doc.pages.length && page2_i <= page_i + 2; page2_i++) {
					let page2 = doc.pages[page2_i];
					
					for (let flow2_i = 0; flow2_i < page2.flows.length; flow2_i++) {
						let flow2 = page2.flows[flow2_i];
						
						for (let block2_i = 0; block2_i < flow2.blocks.length; block2_i++) {
							let block2 = flow2.blocks[block2_i];
							
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
										text += data1;
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return text;
};

Page.prototype.getTitleBreakLine = function (doc) {
	for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
		let page = doc.pages[pageIndex];
		for (let flow of page.flows) {
			for (let block of flow.blocks) {
				for (let line of block.lines) {
					if (/^(Keyword|KEYWORD|Key Word|Key word|Indexing Terms)/.test(line.text)) {
						return {pageIndex, pageY: line.yMin};
					}
					
					let text = line.text;
					text = text.replace(/[^A-Za-z]/g, '');
					if (['introduction', 'contents'].includes(text.toLowerCase()) && text[0] === text[0].toUpperCase()) {
						return {pageIndex, pageY: line.yMin}
					}
				}
			}
		}
	}
	return null;
};
