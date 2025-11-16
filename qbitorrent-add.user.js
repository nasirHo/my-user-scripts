// ==UserScript==
// @name         add-to-qb
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  interact with qbitorrent at certain website
// @author       nasirho
// @match        https://*.sehuatang.org/thread*
// @match        https://*.sehuatang.org/forum.php?mod=viewthread*
// @match        https://sukebei.nyaa.si/view/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=qbittorrent.org
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      192.168.52.2
// @require      https://raw.githubusercontent.com/nasirHo/my-user-scripts/refs/heads/main/lib/utils.js
// @updateURL    https://github.com/nasirHo/my-user-scripts/raw/refs/heads/main/qbitorrent-add.user.js
// @downloadURL  https://github.com/nasirHo/my-user-scripts/raw/refs/heads/main/qbitorrent-add.user.js
// ==/UserScript==

(function () {
  "use strict";

  // --- Configuration ---
  const QB_CONFIG = {
    // Let user configure these
    url: GM_getValue("QB_URL", "http://192.168.52.2:38080"),
    username: GM_getValue("QB_USERNAME", ""),
    password: GM_getValue("QB_PASSWORD", ""),
    https_url: GM_getValue("QB_HTTPS_URL", "https://aqb.cozybear.casa"),
    // Internal key, not for users
    cookieKey: "qb-cookies",
  };
  const qbRequester = getQbRequester(QB_CONFIG);

  // --- Configuration Menu ---
  function runFullConfig() {
    const url = prompt("Enter your qBittorrent WebUI URL:", QB_CONFIG.url);
    if (url !== null) GM_setValue("QB_URL", url);

    const user = prompt("Enter your qBittorrent Username:", QB_CONFIG.username);
    if (user !== null) GM_setValue("QB_USERNAME", user);

    const pass = prompt("Enter your qBittorrent Password:", QB_CONFIG.password);
    if (pass !== null) GM_setValue("QB_PASSWORD", pass);

    const httpsUrl = prompt(
      "Enter your public-facing URL (for links):",
      QB_CONFIG.https_url,
    );
    if (httpsUrl !== null) GM_setValue("QB_HTTPS_URL", httpsUrl);

    alert("qBittorrent settings saved! Please refresh the page.");
    window.location.reload();
  }

  GM_registerMenuCommand("⚙️ Configure qBittorrent Script", runFullConfig);
  GM_addStyle(`
    .qb-action-container {
        display: flex;
        flex-wrap: wrap; /* Allow buttons to wrap on small screens */
        gap: 8px;
        margin-bottom: 10px;
        margin-top: 10px;
    }

    /* Base style for all buttons/links */
    .qb-action-button {
        display: block;
        padding: 8px 12px;
        cursor: pointer;
        color: white !important; /* Override site styles */
        border: none;
        border-radius: 4px;
        font-weight: bold;
        text-decoration: none;
        font-size: 14px;
        line-height: 1.2;
    }

    /* Specific button colors */
    .qb-button-send { background-color: #08558c; }
    .qb-button-javdb { background-color: #ed2096; }
    .qb-button-avbase { background-color: #4e4e4e; }

    /* Status link styles */
    .qb-status-searching { background-color: #818589; }
    .qb-status-not-found { background-color: #f44336; }
    .qb-status-found { background-color: #4CAF50; }
    .qb-status-missing { background-color: #FFA500; }

    /* Config banner from Step 1 */
    #qb-config-banner {
        position: fixed; top: 0; left: 0; width: 100%;
        background-color: #f44336; color: white; padding: 10px;
        text-align: center; z-index: 9999;
    }
    #qb-config-banner button {
        margin-left: 15px; background-color: white; color: #f44336;
        border: none; padding: 5px 8px; border-radius: 4px; font-weight: bold;
    }
`);
  const findTorrents = async (searchName) => {
    let foundTorrents = [];
    try {
      foundTorrents = await qbRequester.queryTorrentsByName(searchName);

      if (foundTorrents.length > 0) {
        console.log(
          `Found ${foundTorrents.length} torrent(s) matching "${searchName}":`,
        );
        // You can now do whatever you want with the results
        foundTorrents.forEach((torrent) => {
          console.log(
            `- Name: ${torrent.name}\n` +
              `- State: ${torrent.state}\n` +
              `- Progress: ${(torrent.progress * 100).toFixed(1)}%\n` +
              `- Hash: ${torrent.hash}`,
          );
          console.log(torrent);
        });
        //alert(`Found ${foundTorrents.length} torrent(s). Check the console for details.`);
      } else {
        //alert(`No torrents found matching "${searchName}".`);
        console.log(`No torrents found matching "${searchName}".`);
      }
    } catch (error) {
      console.error("The query failed:", error);
    }
    return foundTorrents;
  };

  const site_settings = {};
  site_settings["sehuatang.org"] = {
    trigger_el_selector: ".attnm > a",
    getNums: () => {
      let el = document.querySelector(".attnm > a");
      if (el) {
        const replaceReg = /(-U?C)*\.torrent/i;
        return el.text.trim().replace(replaceReg, "");
      } else {
        el = document.querySelector("#thread_subject");
        return el.textContent.trim().split(" ")[0];
      }
    },
    getMags: () => document.querySelector(".blockcode li").textContent.trim(),
    getAnchor: () => document.querySelector("div.pct"),
  };
  site_settings["sukebei.nyaa.si"] = {
    trigger_el_selector: "a.card-footer-item",
    getNums: () => {
      if (document.querySelector('a[href^="/user"]').text === "offkab") {
        return document.querySelector("a.folder").text;
      } else {
        return document.querySelector("h3.panel-title").textContent.trim();
      }
    },
    getMags: () => document.querySelector("a.card-footer-item").href,
    getAnchor: () => document.querySelector("div.panel.panel-success"),
  };

  function createActionButton(text, className, onClick) {
    const button = document.createElement("button");
    button.textContent = text;
    // Combine base class with specific class
    button.className = `qb-action-button ${className}`;
    button.addEventListener("click", onClick);
    return button;
  }

  const main_func = async (site_conf) => {
    if (!QB_CONFIG.username || !QB_CONFIG.password) {
      showConfigBanner(
        "qb-config-banner",
        "'add-to-qb' script needs configuration.",
        runFullConfig,
      ); // Show the banner
      console.error("qBittorrent credentials not set.");
      return; // Stop the script
    }
    const anchorDiv = site_conf.getAnchor();
    if (anchorDiv === null) {
      console.log("anchor not found");
      return;
    }

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "qb-action-container";

    const loadIcon = document.createElement("a");
    loadIcon.className = "qb-action-button qb-status-searching";
    loadIcon.textContent = "⏳Searching aqb...";
    loadIcon.href = QB_CONFIG.https_url;
    loadIcon.target = "_blank";
    buttonContainer.appendChild(loadIcon);

    // --- Use the helper function for other buttons ---
    buttonContainer.appendChild(
      createActionButton("➤ Send to qB", "qb-button-send", () => {
        console.log("Sending link:", site_conf.getMags());
        qbRequester.addTorrent(site_conf.getMags());
      }),
    );

    buttonContainer.appendChild(
      createActionButton("🔎 Search on JavDB", "qb-button-javdb", () => {
        GM_openInTab(
          `https://javdb.com/search?f=all&q=${site_conf.getNums()}`,
          { active: true },
        );
      }),
    );

    buttonContainer.appendChild(
      createActionButton("🔎 Search on AvBase", "qb-button-avbase", () => {
        GM_openInTab(`https://www.avbase.net/works?q=${site_conf.getNums()}`, {
          active: true,
        });
      }),
    );

    anchorDiv.before(buttonContainer);

    let foundTorrents;
    try {
      foundTorrents = await findTorrents(site_conf.getNums());
    } catch (error) {
      loadIcon.textContent = "⚠️ Query Error";
      loadIcon.className = "qb-action-button qb-status-not-found";
      return;
    }
    loadIcon.remove();
    if (foundTorrents.length === 0) {
      const notFoundIcon = document.createElement("a");
      notFoundIcon.className = "qb-action-button qb-status-not-found";
      notFoundIcon.textContent = "❌ Not in aqb";
      notFoundIcon.target = "_blank";
      notFoundIcon.href = QB_CONFIG.https_url;
      buttonContainer.prepend(notFoundIcon); // Add to the front
    } else {
      foundTorrents.forEach((torrent) => {
        const isMissing = torrent.state === "missingFiles";
        const icon = document.createElement("button");
        icon.className = `qb-action-button ${isMissing ? "qb-status-missing" : "qb-status-found"}`;
        icon.textContent = isMissing ? "🚮 Deleted" : "✅ In aqb";

        icon.addEventListener("click", () => {
          const date = new Date(torrent.added_on * 1000).toISOString();
          if (
            confirm(
              `Do you want to delete the torrent?\n\n${torrent.name}\nAdded: ${date}`,
            )
          ) {
            qbRequester.removeTorrent(torrent.hash, true);
          }
        });
        buttonContainer.prepend(icon); // Add to the front
      });
    }
  };

  console.log("add-qb script load");

  window.addEventListener("load", async () => {
    console.log("add-qb script fired");
    main_func(site_settings[window.location.hostname.replace("www\.", "")]);
  });
})();
