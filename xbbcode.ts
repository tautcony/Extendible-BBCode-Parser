/*
Copyright (C) 2011 Patrick Gillespie, http://patorjk.com/
Copyright (C) 2017 TautCony, http://tautcony.github.io/

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
    Extendible BBCode Parser v2.0.0
    By Patrick Gillespie (patorjk@gmail.com)
    Website: http://patorjk.com/

    Port into TypeScript by TautCony
    Website: http://tautcony.github.com/

    This module allows you to parse BBCode and to extend to the mark-up language
    to add in your own tags.
*/
namespace XBBCODE {
    interface IMap<T> {
        [key: string]: T;
    }

    interface ITag {
        displayContent?: boolean;
        restrictParentsTo?: string[];
        restrictChildrenTo?: string[];
        noParse?: boolean;

        validChildLookup?: IMap<boolean>;
        validParentLookup?: IMap<boolean>;

        openTag(params: string, content: string): string;
        closeTag(params: string, content: string): string;
    }

    interface IConfig {
        text: string;
        removeMisalignedTags?: boolean;
        addInLineBreaks?: boolean;
        escapeHtml?: boolean;
    }

    interface IResult {
        html: string;
        error: boolean;
        errorQueue: string[];
    }

    // -----------------------------------------------------------------------------
    // Set up private variables
    // -----------------------------------------------------------------------------
    const validColors      = ["aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue",
                              "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson",
                              "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange",
                              "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
                              "dimgray", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
                              "gray", "green", "greenyellow", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
                              "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightpink",
                              "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta",
                              "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred",
                              "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
                              "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink",
                              "plum", "powderblue", "purple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
                              "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "snow", "springgreen", "steelblue", "tan",
                              "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"];

    const urlPattern       = /^(?:https?|file|c):(?:\/{1,3}|\\{1})[-a-zA-Z0-9:;@#%&()~_?\+=\/\\\.]*$/;
    const colorNamePattern = new RegExp(`^(?:${validColors.join("|")})$`);
    const colorCodePattern = /^[#]?[a-fA-F0-9]{6}$/;
    const emailPattern     = /[^\s@]+@[^\s@]+\.[^\s@]+/;
    const fontFacePattern  = /^([a-z][a-z0-9_]+|"[a-z][a-z0-9_\s]+")$/i;

    let bbRegExp: RegExp;
    let pbbRegExp: RegExp;
    let pbbRegExp2: RegExp;
    let openTags: RegExp;
    let closeTags: RegExp;

    let tagList: string[];
    const tagsNoParseList: string[] = [];

    /* -----------------------------------------------------------------------------
     * tags
     * This object contains a list of tags that your code will be able to understand.
     * Each tag object has the following properties:
     *
     *   openTag - A function that takes in the tag's parameters (if any) and its
     *             contents, and returns what its HTML open tag should be.
     *             Example: [color=red]test[/color] would take in "=red" as a
     *             parameter input, and "test" as a content input.
     *             It should be noted that any BBCode inside of "content" will have
     *             been processed by the time it enter the openTag function.
     *
     *   closeTag - A function that takes in the tag's parameters (if any) and its
     *              contents, and returns what its HTML close tag should be.
     *
     *   displayContent - Defaults to true. If false, the content for the tag will
     *                    not be displayed. This is useful for tags like IMG where
     *                    its contents are actually a parameter input.
     *
     *   restrictChildrenTo - A list of BBCode tags which are allowed to be nested
     *                        within this BBCode tag. If this property is omitted,
     *                        any BBCode tag may be nested within the tag.
     *
     *   restrictParentsTo - A list of BBCode tags which are allowed to be parents of
     *                       this BBCode tag. If this property is omitted, any BBCode
     *                       tag may be a parent of the tag.
     *
     *   noParse - true or false. If true, none of the content WITHIN this tag will be
     *             parsed by the XBBCode parser.
     *
     *
     *
     * LIMITIONS on adding NEW TAGS:
     *  - Tag names should be alphanumeric (including underscores) and all tags should have an opening tag
     *    and a closing tag.
     *    The [*] tag is an exception because it was already a standard
     *    bbcode tag. Technecially tags don't *have* to be alphanumeric, but since
     *    regular expressions are used to parse the text, if you use a non-alphanumeric
     *    tag names, just make sure the tag name gets escaped properly (if needed).
     * --------------------------------------------------------------------------- */
    const tags: IMap<ITag> = {
        /*
            The [*] tag is special since the user does not define a closing [/*] tag when writing their bbcode.
            Instead this module parses the code and adds the closing [/*] tag in for them. None of the tags you
            add will act like this and this tag is an exception to the others.
        */
        "*": {
            openTag(params, content) {
                return "<li>";
            },
            closeTag(params, content) {
                return "</li>";
            },
            restrictParentsTo: ["list", "ul", "ol"],
        },
        "b": {
            openTag(params, content) {
                return "<span class='xbbcode-b'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        /*
            This tag does nothing and is here mostly to be used as a classification for
            the bbcode input when evaluating parent-child tag relationships
        */
        "bbcode": {
            openTag(params, content) {
                return "";
            },
            closeTag(params, content) {
                return "";
            },
        },
        "center": {
            openTag(params, content) {
                return "<span class='xbbcode-center'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "code": {
            openTag(params, content) {
                return "<span class='xbbcode-code'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
            noParse: true,
        },
        "color": {
            openTag(params, content) {
                params = params || "";

                let colorCode = (params.substr(1)).toLowerCase() || "black";
                colorNamePattern.lastIndex = 0;
                colorCodePattern.lastIndex = 0;
                if (!colorNamePattern.test(colorCode)) {
                    if (!colorCodePattern.test(colorCode)) {
                        colorCode = "black";
                    } else {
                        if (colorCode.substr(0, 1) !== "#") {
                            colorCode = `#${colorCode}`;
                        }
                    }
                }

                return `<span style="color:${colorCode}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "email": {
            openTag(params, content) {
                let myEmail;

                if (!params) {
                    myEmail = content.replace(/<.*?>/g, "");
                } else {
                    myEmail = params.substr(1);
                }

                emailPattern.lastIndex = 0;
                if (!emailPattern.test(myEmail)) {
                    return "<a>";
                }

                return `<a href="mailto:"${myEmail}">`;
            },
            closeTag(params, content) {
                return "</a>";
            },
        },
        "face": {
            openTag(params, content) {
                params = params || "";

                let faceCode = params.substr(1) || "inherit";
                fontFacePattern.lastIndex = 0;
                if (!fontFacePattern.test(faceCode)) {
                    faceCode = "inherit";
                }
                return `<span style="font-family:${faceCode}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "font": {
            openTag(params, content) {
                params = params || "";

                let faceCode = params.substr(1) || "inherit";
                fontFacePattern.lastIndex = 0;
                if (!fontFacePattern.test(faceCode)) {
                    faceCode = "inherit";
                }
                return `<span style="font-family:${faceCode}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "i": {
            openTag(params, content) {
                return "<span class='xbbcode-i'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "img": {
            openTag(params, content) {
                let myUrl = content;

                urlPattern.lastIndex = 0;
                if (!urlPattern.test(myUrl)) {
                    myUrl = "";
                }

                return `<img src="${myUrl}" />`;
            },
            closeTag(params, content) {
                return "";
            },
            displayContent: false,
        },
        "justify": {
            openTag(params, content) {
                return "<span class='xbbcode-justify'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "large": {
            openTag(params, content) {
                params = params || "";

                let colorCode = params.substr(1) || "inherit";
                colorNamePattern.lastIndex = 0;
                colorCodePattern.lastIndex = 0;
                if (!colorNamePattern.test(colorCode)) {
                    if (!colorCodePattern.test(colorCode)) {
                        colorCode = "inherit";
                    } else {
                        if (colorCode.substr(0, 1) !== "#") {
                            colorCode = `#${colorCode}`;
                        }
                    }
                }

                return `<span class="xbbcode-size-36" style="color:${colorCode}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "left": {
            openTag(params, content) {
                return "<span class='xbbcode-left'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "li": {
            openTag(params, content) {
                return "<li>";
            },
            closeTag(params, content) {
                return "</li>";
            },
            restrictParentsTo: ["list", "ul", "ol"],
        },
        "list": {
            openTag(params, content) {
                return "<ul>";
            },
            closeTag(params, content) {
                return "</ul>";
            },
            restrictChildrenTo: ["*", "li"],
        },
        "noparse": {
            openTag(params, content) {
                return "";
            },
            closeTag(params, content) {
                return "";
            },
            noParse: true,
        },
        "ol": {
            openTag(params, content) {
                return "<ol>";
            },
            closeTag(params, content) {
                return "</ol>";
            },
            restrictChildrenTo: ["*", "li"],
        },
        "php": {
            openTag(params, content) {
                return "<span class='xbbcode-code'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
            noParse: true,
        },
        "quote": {
            openTag(params, content) {
                return "<blockquote class='xbbcode-blockquote'>";
            },
            closeTag(params, content) {
                return "</blockquote>";
            },
        },
        "right": {
            openTag(params, content) {
                return "<span class='xbbcode-right'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "s": {
            openTag(params, content) {
                return "<span class='xbbcode-s'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "size": {
            openTag(params, content) {
                params = params || "";

                let mySize = parseInt(params.substr(1), 10) || 0;
                if (mySize < 4 || mySize > 40) {
                    mySize = 14;
                }

                return `<span class="xbbcode-size-${mySize}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "small": {
            openTag(params, content) {
                params = params || "";

                let colorCode = params.substr(1) || "inherit";
                colorNamePattern.lastIndex = 0;
                colorCodePattern.lastIndex = 0;
                if (!colorNamePattern.test(colorCode)) {
                    if (!colorCodePattern.test(colorCode)) {
                        colorCode = "inherit";
                    } else {
                        if (colorCode.substr(0, 1) !== "#") {
                            colorCode = `#${colorCode}`;
                        }
                    }
                }

                return `<span class="xbbcode-size-10" style="color:${colorCode}">`;
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "sub": {
            openTag(params, content) {
                return "<sub>";
            },
            closeTag(params, content) {
                return "</sub>";
            },
        },
        "sup": {
            openTag(params, content) {
                return "<sup>";
            },
            closeTag(params, content) {
                return "</sup>";
            },
        },
        "table": {
            openTag(params, content) {
                return "<table class='xbbcode-table'>";
            },
            closeTag(params, content) {
                return "</table>";
            },
            restrictChildrenTo: ["tbody", "thead", "tfoot", "tr"],
        },
        "tbody": {
            openTag(params, content) {
                return "<tbody>";
            },
            closeTag(params, content) {
                return "</tbody>";
            },
            restrictChildrenTo: ["tr"],
            restrictParentsTo: ["table"],
        },
        "td": {
            openTag(params, content) {
                return "<td class='xbbcode-td'>";
            },
            closeTag(params, content) {
                return "</td>";
            },
            restrictParentsTo: ["tr"],
        },
        "tfoot": {
            openTag(params, content) {
                return "<tfoot>";
            },
            closeTag(params, content) {
                return "</tfoot>";
            },
            restrictChildrenTo: ["tr"],
            restrictParentsTo: ["table"],
        },
        "th": {
            openTag(params, content) {
                return "<th class='xbbcode-th'>";
            },
            closeTag(params, content) {
                return "</th>";
            },
            restrictParentsTo: ["tr"],
        },
        "thead": {
            openTag(params, content) {
                return "<thead class='xbbcode-thead'>";
            },
            closeTag(params, content) {
                return "</thead>";
            },
            restrictChildrenTo: ["tr"],
            restrictParentsTo: ["table"],
        },
        "tr": {
            openTag(params, content) {
                return "<tr class='xbbcode-tr'>";
            },
            closeTag(params, content) {
                return "</tr>";
            },
            restrictChildrenTo: ["td", "th"],
            restrictParentsTo: ["table", "tbody", "tfoot", "thead"],
        },
        "u": {
            openTag(params, content) {
                return "<span class='xbbcode-u'>";
            },
            closeTag(params, content) {
                return "</span>";
            },
        },
        "ul": {
            openTag(params, content) {
                return "<ul>";
            },
            closeTag(params, content) {
                return "</ul>";
            },
            restrictChildrenTo: ["*", "li"],
        },
        "url": {
            openTag(params, content) {
                let myUrl;

                if (!params) {
                    myUrl = content.replace(/<.*?>/g, "");
                } else {
                    myUrl = params.substr(1);
                }

                urlPattern.lastIndex = 0;
                if (!urlPattern.test(myUrl)) {
                    myUrl = "#";
                }

                return `<a href="${myUrl}">`;
            },
            closeTag(params, content) {
                return "</a>";
            },
        },
    };

    function initTags() {
        tagList = [];
        for (const prop in tags) {
            if (!tags.hasOwnProperty(prop)) {
                continue;
            }
            if (prop === "*") {
                tagList.push(`\\${prop}`);
            } else {
                tagList.push(prop);
                if (tags[prop].noParse !== undefined) {
                    tagsNoParseList.push(prop);
                }
            }

            tags[prop].validChildLookup   = {};
            tags[prop].validParentLookup  = {};
            tags[prop].restrictParentsTo  = tags[prop].restrictParentsTo || [];
            tags[prop].restrictChildrenTo = tags[prop].restrictChildrenTo || [];

            for (const item of tags[prop].restrictChildrenTo) {
                tags[prop].validChildLookup[item] = true;
            }
            for (const item of tags[prop].restrictParentsTo) {
                tags[prop].validParentLookup[item] = true;
            }
        }

        bbRegExp   = new RegExp(`<bbcl=([0-9]+) (${tagList.join("|")})([ =][^>]*?)?>((?:.|[\\r\\n])*?)<bbcl=\\1 /\\2>`, "gi");
        pbbRegExp  = new RegExp(`\\[(${tagList.join("|")})([ =][^\\]]*?)?\\]([^\\[]*?)\\[/\\1\\]`, "gi");
        pbbRegExp2 = new RegExp(`\\[(${tagsNoParseList.join("|")})([ =][^\\]]*?)?\\]([\\s\\S]*?)\\[/\\1\\]`, "gi");

        // create the regex for escaping ['s that aren't apart of tags
        const closeTagList: string[] = [];
        for (const tag of tagList) {
            if (tag !== "\\*") { // the * tag doesn't have an offical closing tag
                closeTagList.push(`/${tag}`);
            }
        }
        openTags  = new RegExp(`(\\[)((?:${tagList.join("|")})(?:[ =][^\\]]*?)?)(\\])`, "gi");
        closeTags = new RegExp(`(\\[)(${closeTagList.join("|")})(\\])`, "gi");
    }
    initTags();

    // -----------------------------------------------------------------------------
    // private functions
    // -----------------------------------------------------------------------------
    function checkParentChildRestrictions(parentTag: string, bbcode: string, bbcodeLevel: number, tagName: string, tagParams: string, tagContents: string, errQueue?: string[]): string[] {

        errQueue = errQueue || [];
        ++bbcodeLevel;

        // get a list of all of the child tags to this tag
        const reTagNames      = new RegExp(`(<bbcl=${bbcodeLevel} )(${tagList.join("|")})([ =>])`, "gi");
        const reTagNamesParts = new RegExp(`(<bbcl=${bbcodeLevel} )(${tagList.join("|")})([ =>])`, "i");
        const matchingTags    = tagContents.match(reTagNames) || [];

        const pInfo: ITag = tags[parentTag];

        reTagNames.lastIndex = 0;

        if (matchingTags.length === 0) {
            tagContents = "";
        }

        for (const matchingTag of matchingTags) {
            reTagNamesParts.lastIndex = 0;
            const childTag = (matchingTag.match(reTagNamesParts))[2].toLowerCase();

            if (pInfo !== undefined && pInfo.restrictChildrenTo && pInfo.restrictChildrenTo.length > 0) {
                if (pInfo.validChildLookup[childTag] !== true) {
                    errQueue.push(`The tag "${childTag}" is not allowed as a child of the tag "${parentTag}".`);
                }
            }
            const cInfo: ITag = tags[childTag] || undefined;
            if (cInfo.restrictParentsTo.length > 0) {
                if (cInfo.validParentLookup[parentTag] !== true) {
                    errQueue.push(`The tag "${parentTag}" is not allowed as a parent of the tag "${childTag}".`);
                }
            }
        }
        tagContents = tagContents.replace(bbRegExp, (matchStr, bbcodeLevelInner, tagNameInner, tagParamsInner, tagContentsInner) => {
            errQueue = checkParentChildRestrictions(tagNameInner.toLowerCase(), matchStr, bbcodeLevelInner, tagNameInner, tagParamsInner, tagContentsInner, errQueue);
            return matchStr;
        });
        return errQueue;
    }

    /*
        This function updates or adds a piece of metadata to each tag called "bbcl" which
        indicates how deeply nested a particular tag was in the bbcode. This property is removed
        from the HTML code tags at the end of the processing.
    */
    function updateTagDepths(tagContents: string): string {
        tagContents = tagContents.replace(/\<([^\>][^\>]*?)\>/gi, (matchStr, subMatchStr) => {
            const bbCodeLevel = subMatchStr.match(/^bbcl=([0-9]+) /);
            if (bbCodeLevel === null) {
                return `<bbcl=0 ${subMatchStr}>`;
            } else {
                const value = subMatchStr.replace(/^(bbcl=)([0-9]+)/, (matchStrInner, m1, m2) => {
                    return m1 + (parseInt(m2, 10) + 1);
                });
                return `<${value}>`;
            }
        });
        return tagContents;
    }

    /*
        This function removes the metadata added by the updateTagDepths function
    */
    function unprocess(tagContent: string): string {
        return tagContent.replace(/<bbcl=[0-9]+ \/\*>/gi, "").replace(/<bbcl=[0-9]+ /gi, "&#91;").replace(/>/gi, "&#93;");
    }

    function replaceFunct(matchStr: string, bbcodeLevel: number, tagName: string, tagParams: string, tagContents: string): string {
        tagName = tagName.toLowerCase();

        let processedContent = tags[tagName].noParse ? unprocess(tagContents) : tagContents.replace(bbRegExp, replaceFunct);
        const openTag  = tags[tagName].openTag(tagParams, processedContent);
        const closeTag = tags[tagName].closeTag(tagParams, processedContent);

        if (tags[tagName].displayContent === false) {
            processedContent = "";
        }

        return openTag + processedContent + closeTag;
    }

    function parse(config: IConfig) {
        return config.text.replace(bbRegExp, replaceFunct);
    }

    /*
        The star tag [*] is special in that it does not use a closing tag. Since this parser requires that tags to have a closing
        tag, we must pre-process the input and add in closing tags [/*] for the star tag.
        We have a little levaridge in that we know the text we're processing wont contain the <> characters (they have been
        changed into their HTML entity form to prevent XSS and code injection), so we can use those characters as markers to
        help us define boundaries and figure out where to place the [/*] tags.
    */
    function fixStarTag(text: string): string {
        text = text.replace(/\[(?!\*[ =\]]|list([ =][^\]]*)?\]|\/list[\]])/ig, "<");
        text = text.replace(/\[(?=list([ =][^\]]*)?\]|\/list[\]])/ig, ">");

        for ( ; ; ) {
            const newText = text.replace(/>list([ =][^\]]*)?\]([^>]*?)(>\/list])/gi, (matchStr, contents, endTag) => {
                let innerListTxt = matchStr;
                for ( ; ; ) {
                    const newInnerListText = innerListTxt.replace(/\[\*\]([^\[]*?)(\[\*\]|>\/list])/i, (matchStrInner, contentsInner, endTagInner) => {
                        if (endTagInner.toLowerCase() === ">/list]") {
                            endTagInner = "</*]</list]";
                        } else {
                            endTagInner = "</*][*]";
                        }
                        return `<*]${contentsInner}${endTagInner}`;
                    });
                    if (innerListTxt !== newInnerListText) {
                        innerListTxt = newInnerListText;
                    } else {
                        break;
                    }
                }
                innerListTxt = innerListTxt.replace(/>/g, "<");
                return innerListTxt;
            });
            if (text !== newText) {
                text = newText;
            } else {
                break;
            }
        }

        // add ['s for our tags back in
        text = text.replace(/</g, "[");
        return text;
    }

    function addBbcodeLevels(text: string): string {
        for ( ; ; ) {
            const newText = text.replace(pbbRegExp, (matchStr, tagName, tagParams, tagContents) => {
                matchStr = matchStr.replace(/\[/g, "<");
                matchStr = matchStr.replace(/\]/g, ">");
                return updateTagDepths(matchStr);
            });
            if (text !== newText) {
                text = newText;
            } else {
                break;
            }
        }
        return text;
    }

    // -----------------------------------------------------------------------------
    // public functions
    // -----------------------------------------------------------------------------

    // API, Expose all available tags
    export function getTags(): IMap<ITag> {
        return tags;
    }

    export function addTags(newtags: IMap<ITag>): void {
        for (const tagName in newtags) {
            if (newtags.hasOwnProperty(tagName)) {
                tags[tagName] = newtags[tagName];
            }
        }
        initTags();
    }

    export function process(config: IConfig): IResult {
        const ret: IResult = { html: "", error: false, errorQueue: [] };

        config.text = config.text.replace(/</g, "&lt;"); // escape HTML tag brackets
        config.text = config.text.replace(/>/g, "&gt;"); // escape HTML tag brackets

        config.text = config.text.replace(openTags, (matchStr, openB, contents, closeB) => {
            return `<${contents}>`;
        });
        config.text = config.text.replace(closeTags, (matchStr, openB, contents, closeB) => {
            return `<${contents}>`;
        });

        config.text = config.text.replace(/\[/g, "&#91;"); // escape ['s that aren't apart of tags
        config.text = config.text.replace(/\]/g, "&#93;"); // escape ['s that aren't apart of tags
        config.text = config.text.replace(/</g, "["); // escape ['s that aren't apart of tags
        config.text = config.text.replace(/>/g, "]"); // escape ['s that aren't apart of tags

        // process tags that don't have their content parsed
        for ( ; ; ) {
            const text = config.text.replace(pbbRegExp2, (matchStr, tagName, tagParams, tagContents) => {
                tagContents = tagContents.replace(/\[/g, "&#91;");
                tagContents = tagContents.replace(/\]/g, "&#93;");
                tagParams = tagParams || "";
                tagContents = tagContents || "";
                return `[${tagName}${tagParams}]${tagContents}[/${tagName}]`;
            });
            if (text !== config.text) {
                config.text = text;
            } else {
                break;
            }
        }

        config.text = fixStarTag(config.text); // add in closing tags for the [*] tag
        config.text = addBbcodeLevels(config.text); // add in level metadata

        ret.errorQueue = checkParentChildRestrictions("bbcode", config.text, -1, "", "", config.text);

        ret.html = parse(config);

        if (ret.html.indexOf("[") !== -1 || ret.html.indexOf("]") !== -1) {
            ret.errorQueue.push("Some tags appear to be misaligned.");
        }

        if (config.removeMisalignedTags) {
            ret.html = ret.html.replace(/\[.*?\]/g, "");
        }
        if (config.addInLineBreaks) {
            ret.html = `<div style="white-space:pre-wrap;">${ret.html}</div>`;
        }

        if (!config.escapeHtml) {
            ret.html = ret.html.replace("&#91;", "["); // put ['s back in
            ret.html = ret.html.replace("&#93;", "]"); // put ['s back in
        }

        ret.error = ret.errorQueue.length !== 0;

        return ret;
    }
}
