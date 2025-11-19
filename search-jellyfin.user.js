// ==UserScript==
// @name         Search on Jellyfin
// @namespace    http://tampermonkey.net/
// @version      2.1g
// @description  Show jellyfin query result on certain website
// @author       nasirho
// @match        https://javdb.com/*
// @match        https://www.avbase.net/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=jellyfin.org
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      192.168.52.2
// @connect      sukebei.nyaa.si
// @require      https://raw.githubusercontent.com/nasirHo/my-user-scripts/refs/heads/main/lib/utils.js
// @updateURL    https://github.com/nasirHo/my-user-scripts/raw/refs/heads/main/search-jellyfin.user.js
// @downloadURL  https://github.com/nasirHo/my-user-scripts/raw/refs/heads/main/search-jellyfin.user.js
// ==/UserScript==

(async function () {
  "use strict";

  const JELLYFIN_API_URL = GM_getValue(
    "JELLYFIN_API_URL",
    "http://192.168.52.2:8096",
  );
  const JELLYFIN_URL = GM_getValue(
    "JELLYFIN_URL",
    "https://jellyfin.cozybear.casa",
  );
  const JELLYFIN_API_KEY = GM_getValue("JELLYFIN_API_KEY", "");
  const JELLYFIN_LIB_ID = GM_getValue("JELLYFIN_LIB_ID", "");
  const jellyfinRequester = getJellyfinRequester(
    JELLYFIN_API_URL,
    JELLYFIN_API_KEY,
    JELLYFIN_LIB_ID,
  );

  const runFullConfig = () => {
    const key = prompt("Enter your Jellyfin API Key", JELLYFIN_API_KEY);
    if (key !== null) GM_setValue("JELLYFIN_API_KEY", key);

    const libId = prompt("Enter your Jellyfin Library ID", JELLYFIN_LIB_ID);
    if (libId !== null) GM_setValue("JELLYFIN_LIB_ID", libId);

    const apiUrl = prompt(
      "Enter your Jellyfin API URL (e.g., http://192.168.52.2:8096)",
      JELLYFIN_API_URL,
    );
    if (apiUrl !== null) GM_setValue("JELLYFIN_API_URL", apiUrl);

    const publicUrl = prompt(
      "Enter your Jellyfin Public URL (e.g., https://jellyfin.cozybear.casa)",
      JELLYFIN_URL,
    );
    if (publicUrl !== null) GM_setValue("JELLYFIN_URL", publicUrl);

    alert(
      "Jellyfin settings saved! Please refresh the page for them to take effect.",
    );
    window.location.reload();
  };

  GM_registerMenuCommand("⚙️ Configure Jellyfin Script", runFullConfig);
  GM_addStyle(`
          .jellyfin-link {
            display: inline-block;
            margin-left: 15px;
            padding: 5px 10px;
            border-radius: 5px;
            color: white !important; /* !important to override site styles */
            text-decoration: none;
            font-size: 14px;
            font-weight: bold;
            font-family:
              -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
              Arial, sans-serif;
            line-height: 1.2; /* Prevent text from being cut off */
          }
          .tag:not(body).nyaa-link {
            color: #fff
          }
          .tag:not(body).nyaa-link-found,
          .jellyfin-link-found {
            background-color: #4caf50; /* Green */
          }
          .tag:not(body).nyaa-link-not-found,
          .jellyfin-link-not-found {
            background-color: #f44336; /* Red */
          }
          .tag:not(body).nyaa-link-click-to-search{
            background-color: #8caaee
          }
          .tag:not(body).nyaa-link-searching,
          .jellyfin-link-searching {
            background-color: #818589; /* Grey */
          }
          .tag:not(body).nyaa-link-failed,
          .jellyfin-link-failed {
            background-color: #cc0000; /* Darker Red */
            cursor: not-allowed;
          }
          #jellyfin-config-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background-color: #f44336; /* Red */
            color: white;
            padding: 10px;
            text-align: center;
            font-size: 16px;
            z-index: 9999;
            font-family:
              -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
              Arial, sans-serif;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
          }
          #jellyfin-config-banner button {
            margin-left: 15px;
            padding: 5px 10px;
            border: none;
            border-radius: 5px;
            background-color: #fff;
            color: #f44336;
            font-weight: bold;
            cursor: pointer;
          }
    `);
  const site_observers = {
    "javdb.com": {
      isOkToAdd: () => {
        return document.querySelectorAll("div.movie-list>div.item").length > 0;
      },
      addSearchBtn: (item) => {
        const tagsDiv = item.querySelector("div.tags");
        if (
          tagsDiv.children.length === 0 ||
          tagsDiv.children[0].textContent[0] !== "含"
        ) {
          const keyword = item.querySelector(
            "div.video-title>strong",
          ).textContent;
          if (!keyword) {
            console.log("No keyword extracted from the item.");
            return;
          }
          const newTag = document.createElement("span");
          newTag.classList.add("tag", "nyaa-link", "nyaa-link-click-to-search");
          newTag.textContent = "🔍 Hover to Search";
          create_search_element(newTag, keyword, getOffkabNyaa);
          tagsDiv.appendChild(newTag);
        }
      },
      getObserveElements: () => {
        return document.querySelectorAll("div.movie-list>div.item");
      },
      observeFunc: async (item) => {
        if (item.querySelector(".jellyfin-status-div")) {
          return;
        }
        const keyword = item.querySelector(
          "div.video-title>strong",
        ).textContent;
        if (!keyword) {
          console.log("No keyword extracted from the item.");
          return;
        }
        item.querySelector("a.box").style.marginBottom = 0;
        const newDiv = document.createElement("div");
        newDiv.classList.add("box", "jellyfin-status-div");
        newDiv.style.textAlign = "center";
        newDiv.style.padding = "2px 2px";
        item.appendChild(newDiv);
        const getSearchResponse = async () => {
          console.log(`search with ${keyword}`);
          return jellyfinRequester.searchJellyfin(keyword);
        };
        await fetch_and_set_icon(getSearchResponse, newDiv, "/details?id=");
      },
    },
    "avbase.net": {
      isOkToAdd: () => {
        return document.querySelectorAll("div.grid>div.relative").length > 0;
      },
      addSearchBtn: (item) => {
        const anchorDiv = item.querySelector(".jellyfin-status-div");
        const keyword = item.querySelector("div.grow>div").lastChild.textContent;
        if (!keyword) {
          console.log("No keyword extracted from the item.");
          return;
        }
        const newTag = document.createElement("span");
        newTag.classList.add("tag", "nyaa-link", "nyaa-link-click-to-search");
        newTag.textContent = "🔍 Hover to Search";
        create_search_element(newTag, keyword, getOffkabNyaa);
        anchorDiv.appendChild(newTag);
      },
      getObserveElements: () => {
        return document.querySelectorAll("div.grid>div.relative");
      },
      observeFunc: async (item) => {
        if (item.querySelector(".jellyfin-status-div")) {
          return;
        }
        const keyword = item.querySelector("div.grow>div").lastChild.textContent;
        if (!keyword) {
          console.log("No keyword extracted from the item.");
          return;
        }
        const newDiv = document.createElement("div");
        newDiv.classList.add(
          "p-2",
          "flex",
          "flex-wrap",
          "gap-2",
          "border-y",
          "border-light",
          "jellyfin-status-div",
        );
        newDiv.style.padding = "2px 2px";
        item.children[0].insertBefore(newDiv, item.children[0].lastChild);
        const getSearchResponse = async () => {
          console.log(`search with ${keyword}`);
          return jellyfinRequester.searchJellyfin(keyword);
        };
        await fetch_and_set_icon(getSearchResponse, newDiv, "/details?id=");
      },
    },
  };

  const site_settings = {
    "javdb.com/v": {
      getAnchor: () => {
        return document.querySelector("h2.title");
      },
      getKeyword: () => {
        return document
          .querySelector("h2.title")
          .firstElementChild.textContent.trim();
      },
      getSearch: jellyfinRequester.searchJellyfin,
      resultPath: "/details?id=",
    },
    "javdb.com/actors": {
      getAnchor: () => {
        return document.querySelector("h2.title");
      },
      getKeyword: () => {
        return document
          .querySelector("span.actor-section-name")
          .textContent.split(",")
          .map((s) => s.trim())
          .at(-1);
      },
      getSearch: jellyfinRequester.searchPersonOnJellyfin,
      resultPath: "/list?type=Movie&personId=",
    },
    "avbase.net/works": {
      getAnchor: () => {
        return document.querySelector(
          "main > :nth-child(2 of section) :has(>a>h1)",
        );
      },
      getKeyword: () => {
        return document.querySelector(
          "main :nth-child(1 of section) span.flex.text-xs > div > span:last-child",
        ).textContent;
      },
      getSearch: jellyfinRequester.searchJellyfin,
      resultPath: "/details?id=",
    },
    "avbase.net/talents": {
      getAnchor: () => {
        return document.querySelector("div :has(>h1)");
      },
      getKeyword: () => {
        return document.querySelector("div > h1").textContent;
      },
      getSearch: jellyfinRequester.searchPersonOnJellyfin,
      resultPath: "/list?type=Movie&personId=",
    },
  };
  /**
   * Attaches a status icon to the page.
   * @param {boolean} found - Whether the media was found in Jellyfin.
   * @param {string} keyword - The search term, used to create a link.
   */
  const attachIcon = (response, anchorElement, path) => {
    if (response.count === 0) {
      const icon = document.createElement("a");
      icon.className = "jellyfin-link jellyfin-link-not-found";
      icon.textContent = "❌ Not in Jellyfin";
      icon.target = "_blank";
      anchorElement.appendChild(icon);
      return;
    }
    response.items.forEach(({ Id, ServerId }) => {
      const icon = document.createElement("a");
      icon.className = "jellyfin-link jellyfin-link-found";
      icon.textContent = "✅ In Jellyfin";
      icon.href = `${JELLYFIN_URL}/web/#${path}${Id}&serverId=${ServerId}`;
      icon.target = "_blank";
      anchorElement.appendChild(icon);
    });
  };

  const fetch_and_set_icon = async (
    getSearchResponse,
    anchorElement,
    resultPath,
  ) => {
    const icon = document.createElement("a");
    icon.className = "jellyfin-link jellyfin-link-searching";
    icon.textContent = "⏳ Searching...";
    anchorElement.appendChild(icon);
    try {
      const response = await getSearchResponse();
      icon.remove();
      attachIcon(response, anchorElement, resultPath);
    } catch (error) {
      console.error("Failed to check Jellyfin library:", error);
      icon.textContent = "⚠️ Error";
      icon.className = "jellyfin-link jellyfin-link-failed";
    }
  };

  const create_search_element = async (element, keyword, searchFunc) => {
    const threshold = 1000;
    let timeout = null;

    function mouseoverHandler() {
      timeout = setTimeout(async () => {
        element.textContent = "⏳ Searching...";
        element.classList.replace(
          "nyaa-link-click-to-search",
          "nyaa-link-searching",
        );
        try {
          const result = await searchFunc(keyword);
          if (result.length > 0) {
            console.log(result);
            element.textContent = "✅ Found";
            element.classList.replace("nyaa-link-searching", "nyaa-link-found");
            element.addEventListener("click", () => {
              GM_openInTab(`https://sukebei.nyaa.si${result[0].url}`, {
                active: true,
              });
            });
          } else {
            element.textContent = "❌ Not found";
            element.classList.replace(
              "nyaa-link-searching",
              "nyaa-link-not-found",
            );
          }
        } catch (error) {
          console.error("Failed to search: ", error);
          element.textContent = "⚠️ Error";
          element.classList.replace("nyaa-link-searching", "nyaa-link-failed");
        }
        element.removeEventListener("mouseover", mouseoverHandler);
        element.removeEventListener("mouseout", mouseoutHandler);
      }, threshold);
    }
    function mouseoutHandler() {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    element.addEventListener("mouseover", mouseoverHandler);
    element.addEventListener("mouseout", mouseoutHandler);
  };

  let isObserver = null;
  const main_func = async () => {
    console.log("search on jellyfin loaded");

    if (!JELLYFIN_API_KEY || !JELLYFIN_LIB_ID) {
      console.error(
        "Jellyfin API Key or Library ID is not set. Please configure the userscript.",
      );
      showConfigBanner(
        "jellyfin-config-banner",
        "The 'Search on Jellyfin' userscript needs configuration.",
        runFullConfig,
      ); // Show the visual warning
      return; // Stop the script from running further
    }
    const site_name = `${window.location.hostname.replace("www\.", "")}/${window.location.pathname.split("/")[1]}`;
    const site_conf = site_settings[site_name];
    const site_observer =
      site_observers[window.location.hostname.replace("www\.", "")];

    if (site_observer !== undefined && site_observer.isOkToAdd()) {
      const items = site_observer.getObserveElements();
      if (items.length > 0) {
        isObserver = new IntersectionObserver(
          async (entries, obs) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const item = entry.target;
                if (item.dataset.jellyfinLoading === "true") {
                  continue; // Already being processed
                }
                item.dataset.jellyfinLoading = "true";
                obs.unobserve(item);
                await site_observer.observeFunc(item);
                if (site_observer.addSearchBtn) {
                  site_observer.addSearchBtn(item);
                }
              }
            }
          },
          {
            threshold: 0.8,
          },
        );
        items.forEach((item) => {
          isObserver.observe(item);
          // if (site_observer.addSearchBtn) {
          //   site_observer.addSearchBtn(item);
          // }
        });
      }
    }

    if (!site_conf) {
      console.log("no site configuration");
      return;
    }
    const keyword = site_conf.getKeyword();
    if (!keyword) {
      console.log("No keyword extracted from the page.");
      return;
    }
    const anchorElement = site_conf.getAnchor();
    if (!anchorElement) {
      console.error("Could not find a suitable element to attach the icon.");
      return;
    }
    const getSearchResponse = async () => {
      console.log(`search with ${keyword}`);
      return site_conf.getSearch(keyword);
    };
    await fetch_and_set_icon(
      getSearchResponse,
      anchorElement,
      site_conf.resultPath,
    );
  };
  main_func();

  const observeUrlChange = () => {
    let oldPath = document.location.pathname;
    const observer = new MutationObserver((mutations) => {
      const newPath = document.location.pathname;
      if (oldPath !== newPath) {
        oldPath = newPath;
        console.log("URL path changed, re-running script.");

        // Remove any old icons before running again
        document.querySelectorAll(".jellyfin-link").forEach((e) => e.remove());
        if (isObserver) {
          isObserver.disconnect();
          isObserver = null;
        }

        // Wait a moment for the SPA to render the new page
        setTimeout(main_func, 500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (window.location.hostname.replace("www\.", "") === "avbase.net") {
    console.log("inject mutationobserver");
    window.onload = observeUrlChange;
  }
})();
