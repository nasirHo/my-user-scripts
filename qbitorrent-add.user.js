// ==UserScript==
// @name         add-to-qb
// @namespace    http://tampermonkey.net/
// @version      2025-11-14
// @description  add to qbitorrent
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

  // Function to show a "Config Needed" banner
  function showConfigBanner() {
    if (document.getElementById("qb-config-banner")) return;
    const banner = document.createElement("div");
    banner.id = "qb-config-banner";
    banner.innerHTML = `
        'add-to-qb' script needs configuration.
        <button id="qb-config-btn">Configure Now</button>
    `;
    document.body.appendChild(banner);
    document.getElementById("qb-config-btn").onclick = runFullConfig;
  }

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
  const gmRequest = (options) => {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...options,
        onload: (response) => resolve(response),
        onerror: (error) => reject(error),
        ontimeout: (error) => reject(new Error("Request timed out.")),
      });
    });
  };
  const performLogin = async () => {
    console.log("Performing login...");
    try {
      const response = await gmRequest({
        method: "POST",
        url: `${QB_CONFIG.url}/api/v2/auth/login`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: `username=${encodeURIComponent(QB_CONFIG.username)}&password=${encodeURIComponent(QB_CONFIG.password)}`,
      });

      if (response.status === 200) {
        const cookieMatch = response.responseHeaders.match(/SID=[^;]+/);
        if (cookieMatch) {
          const newCookie = cookieMatch[0];
          console.log("Login successful, got new cookie:", newCookie);
          await GM_setValue(QB_CONFIG.cookieKey, newCookie);
          return newCookie; // Resolve with the new cookie
        } else {
          // This shouldn't happen, but good to check
          throw new Error("Login successful, but no cookie was returned.");
        }
      } else {
        // Login failed (wrong credentials)
        await GM_setValue(QB_CONFIG.cookieKey, null); // Clear any bad cookie
        throw new Error("qBittorrent login failed! Check credentials.");
      }
    } catch (error) {
      alert("Could not connect to qBittorrent for login.");
      console.error("Login request failed:", error);
      throw error; // Re-throw to be caught by the calling function
    }
  };
  /**
   * Makes an authenticated request to the qBittorrent API.
   * Handles session expiry and re-login automatically.
   * @param {string} endpoint - The API endpoint (e.g., "/api/v2/torrents/add").
   * @param {object} options - Optional settings.
   * @param {string} [options.method='GET'] - The HTTP method.
   * @param {string} [options.data=null] - The data to send (for POST requests).
   * @param {object} [options.headers={}] - Any additional headers.
   * @param {boolean} [options.isRetry=false] - Internal flag to prevent infinite retries.
   * @returns {Promise<object>} The full response object from gmRequest.
   */
  const qbRequest = async (endpoint, options = {}) => {
    const {
      method = "GET",
      data = null,
      headers = {},
      isRetry = false,
    } = options;
    const url = `${QB_CONFIG.url}${endpoint}`;

    // 1. Get the last known cookie
    let cookie = await GM_getValue(QB_CONFIG.cookieKey, null);

    const requestHeaders = { ...headers, Cookie: cookie };
    if (method === "POST" && data) {
      requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }

    // 2. Try the request
    const response = await gmRequest({
      method: method,
      url: url,
      headers: requestHeaders,
      data: data,
    });

    // 3. Check for unauthorized error
    if ((response.status === 401 || response.status === 403) && !isRetry) {
      console.log("qB session expired or invalid. Re-logging in...");

      // 4. If unauthorized, perform login
      const newCookie = await performLogin(); // This will throw an error if it fails

      // 5. Retry the *original* request with the new cookie
      console.log("Re-login successful. Retrying original request...");
      return await qbRequest(endpoint, { ...options, isRetry: true });
    }

    // 6. Check for other HTTP errors
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    // 7. Success!
    return response;
  };
  const addTorrent = async (torrentLink) => {
    try {
      const response = await qbRequest("/api/v2/torrents/add", {
        method: "POST",
        data: `urls=${encodeURIComponent(torrentLink)}`,
      });

      if (response.responseText === "Ok.") {
        alert("Torrent sent successfully!");
        window.location.reload();
      } else {
        alert(`Failed to add torrent: ${response.responseText}`);
      }
    } catch (error) {
      alert(`An error occurred while sending the torrent: ${error.message}`);
    }
  };

  const removeTorrent = async (hashes, deleteFiles) => {
    try {
      await qbRequest("/api/v2/torrents/delete", {
        method: "POST",
        data: `hashes=${hashes}&deleteFiles=${deleteFiles}`,
      });

      // If qbRequest didn't throw, we assume success
      alert("Torrent delete successfully!");
      // Refresh the page to update the button status
      window.location.reload();
    } catch (error) {
      alert(`An error occurred while deleting the torrent: ${error.message}`);
    }
  };

  const queryTorrentsByName = async (name) => {
    try {
      console.log(`Querying torrents with name including "${name}"...`);
      const response = await qbRequest("/api/v2/torrents/info");

      const allTorrents = JSON.parse(response.responseText);
      const searchName = name.toLowerCase();

      const matchingTorrents = allTorrents.filter((torrent) =>
        torrent.name.toLowerCase().includes(searchName),
      );

      return matchingTorrents;
    } catch (error) {
      alert(`Error querying torrents: ${error.message}`);
      return []; // Return an empty array on failure
    }
  };

  const findTorrents = async (searchName) => {
    let foundTorrents = [];
    try {
      foundTorrents = await queryTorrentsByName(searchName);

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

  const createButtons = async (site_conf) => {
    if (!QB_CONFIG.username || !QB_CONFIG.password) {
      showConfigBanner(); // Show the banner
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
        addTorrent(site_conf.getMags());
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
            removeTorrent(torrent.hash, true);
          }
        });
        buttonContainer.prepend(icon); // Add to the front
      });
    }
  };

  console.log("add-qb script load");

  window.addEventListener("load", async () => {
    console.log("add-qb script fired");
    createButtons(site_settings[window.location.hostname.replace("www\.", "")]);
  });
})();
