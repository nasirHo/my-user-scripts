const showConfigBanner = (bannerId, bannerText, configFunc) => {
  if (document.getElementById(bannerId)) return;

  const banner = document.createElement("div");
  banner.id = bannerId;

  const text = document.createElement("span");
  text.textContent = bannerText;

  const button = document.createElement("button");
  button.textContent = "Configure Now";

  button.onclick = configFunc;

  banner.appendChild(text);
  banner.appendChild(button);
  document.body.appendChild(banner);
};

/**
 * A simple promise-based wrapper for GM_xmlhttpRequest.
 * @param {object} options - The options for GM_xmlhttpRequest.
 * @returns {Promise<object>} A promise that resolves with the response object.
 */
function gmRequest(options) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...options,
      onload: (response) => resolve(response),
      onerror: (error) => reject(error),
      ontimeout: (error) => reject(new Error("Request timed out.")),
    });
  });
}

/**
 * Factory function to create a pre-configured Jellyfin requester.
 * @param {string} apiUrl - The base URL of your Jellyfin instance (e.g., http://192.168.1.1:8096)
 * @param {string} apiKey - Your Jellyfin API key.
 * @returns {object} An object with search methods.
 */
const getJellyfinRequester = (apiUrl, apiKey) => {
  const jellyfinRequest = async (endpoint, params) => {
    const url = new URL(endpoint, apiUrl);
    url.search = new URLSearchParams(params).toString();

    return gmRequest({
      method: "GET",
      url: url.href,
      headers: {
        "X-Emby-Token": apiKey,
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.status >= 200 && response.status < 300) {
          const data = JSON.parse(response.responseText);
          return {
            items: data.Items.map(({ Id, ServerId }) => ({ Id, ServerId })),
            count: data.TotalRecordCount,
          };
        } else {
          throw new Error(`Server responded with status: ${response.status}`);
        }
      })
      .catch((error) => {
        console.error("Jellyfin request error:", error);
        throw error; // Re-throw
      });
  };
  return {
    jellyfinRequest: jellyfinRequest,

    searchJellyfin: (keyword, libId) => {
      return jellyfinRequest("/Items", {
        searchTerm: keyword,
        parentId: libId,
        includeItemTypes: "Movie",
        recursive: "true",
      });
    },

    searchPersonOnJellyfin: (keyword) => {
      return jellyfinRequest("/Persons", {
        searchTerm: keyword,
      });
    },
  };
};

const getQbRequester = (config) => {
  const { url, username, password, cookieKey } = config;

  const performLogin = async () => {
    console.log("Performing login...");
    try {
      const response = await gmRequest({
        method: "POST",
        url: `${url}/api/v2/auth/login`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      });

      if (response.status === 200) {
        const cookieMatch = response.responseHeaders.match(/SID=[^;]+/);
        if (cookieMatch) {
          const newCookie = cookieMatch[0];
          console.log("Login successful, got new cookie:", newCookie);
          await GM_setValue(cookieKey, newCookie);
          return newCookie; // Resolve with the new cookie
        } else {
          // This shouldn't happen, but good to check
          throw new Error("Login successful, but no cookie was returned.");
        }
      } else {
        await GM_setValue(cookieKey, null); // Clear any bad cookie
        throw new Error("qBittorrent login failed! Check credentials.");
      }
    } catch (error) {
      alert("Could not connect to qBittorrent for login.");
      console.error("Login request failed:", error);
      throw error; // Re-throw to be caught by the calling function
    }
  };

  const qbRequest = async (endpoint, options = {}) => {
    const {
      method = "GET",
      data = null,
      headers = {},
      isRetry = false,
    } = options;
    const url = `${url}${endpoint}`;

    // 1. Get the last known cookie
    let cookie = await GM_getValue(cookieKey, null);

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

  // --- Return the public-facing methods ---
  return {
    addTorrent: async (torrentLink) => {
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
    },
    removeTorrent: async (hashes, deleteFiles) => {
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
    },
    queryTorrentsByName: async (name) => {
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
    },
  };
};
