if (typeof(Cc) == "undefined")
	var Cc = Components.classes;
if (typeof(Ci) == "undefined")
	var Ci = Components.interfaces;
if (typeof(Cu) == "undefined")
	var Cu = Components.utils;

if (typeof(SBProperties) == "undefined") {
    Cu.import("resource://app/jsmodules/sbProperties.jsm");
    if (!SBProperties)
        throw new Error("Import of sbProperties module failed");
}

if (typeof(LibraryUtils) == "undefined") {
    Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
    if (!LibraryUtils)
        throw new Error("Import of sbLibraryUtils module failed");
}

if (typeof(songbirdMainWindow) == "undefined")
	var songbirdMainWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
			.getService(Ci.nsIWindowMediator)
			.getMostRecentWindow("Songbird:Main").window;

if (typeof(gBrowser) == "undefined")
	var gBrowser = Cc["@mozilla.org/appshell/window-mediator;1"]
			.getService(Ci.nsIWindowMediator)
			.getMostRecentWindow("Songbird:Main").window.gBrowser;

if (typeof(gPPS) == "undefined")
	var gPPS = Cc['@songbirdnest.com/Songbird/PlaylistPlayback;1']
			.getService(Ci.sbIPlaylistPlayback);

if (typeof(gMetrics) == "undefined")
	var gMetrics = Cc["@songbirdnest.com/Songbird/Metrics;1"]
    		.createInstance(Ci.sbIMetrics);

function flushDisplay() {
	if (typeof(Components) == "undefined")
		return;
	while ((typeof(Components) != "undefined") && 
			Components.classes["@mozilla.org/thread-manager;1"].getService()
			.currentThread.hasPendingEvents())
	{
		Components.classes["@mozilla.org/thread-manager;1"].getService()
				.currentThread.processNextEvent(true);
	}
}

	
if (typeof ConcertTicketing == 'undefined') {
	var ConcertTicketing = {};
}

ConcertTicketing.unload = function() {
	Components.classes["@songbirdnest.com/Songbird/Concerts/Songkick;1"]
		.getService(Components.interfaces.sbISongkick)
		.unregisterDisplayCallback();
}

ConcertTicketing.init = function() {
	var self = this;

	this.dateFormat = "%a, %b %e, %Y";
	if (navigator.platform.substr(0, 3) == "Win")
		this.dateFormat = "%a, %b %#d, %Y";

	this.Cc = Components.classes;
	this.Ci = Components.interfaces;

	// Load the iframe
	this.iframe = document.getElementById("concert-listings");

	// Set a pointer to our document so we can update it later as needed
	this._browseDoc = this.iframe.contentWindow.document;
	
	// Set our string bundle for localised string lookups
	this._strings = document.getElementById("concerts-strings");

	// Apply styles to the iframe
	var headNode = this._browseDoc.getElementsByTagName("head")[0];
	var cssNode = this._browseDoc.createElementNS(
			"http://www.w3.org/1999/xhtml", "html:link");
	cssNode.type = 'text/css';
	cssNode.rel = 'stylesheet';
	cssNode.href = 'chrome://concerts/skin/browse.css';
	cssNode.media = 'screen';
	headNode.appendChild(cssNode);

	// Get the Songkick XPCOM service
	this.skSvc = Cc["@songbirdnest.com/Songbird/Concerts/Songkick;1"]
		.getService(Ci.sbISongkick);
	
	// Set the checked state for the filter checkbox
	this.filterLibraryArtists = Application.prefs
			.getValue("extensions.concerts.filterLibraryArtists", true);
	var checkbox = document.getElementById("checkbox-library-artists");
	checkbox.style.visibility = "visible";
	if (this.filterLibraryArtists == true)
		checkbox.setAttribute("checked", true);
	else
		checkbox.setAttribute("checked", false);
	
	// Get pref to display play link or not
	this.showPlayLink = Application.prefs
			.getValue("extensions.concerts.showplaylink", false);
	this.showGCal = Application.prefs
			.getValue("extensions.concerts.showgcal", false);

	// Set the last saved concert count
	this.lastConcertCount = this.skSvc.getConcertCount(
			this.filterLibraryArtists);

	// See what our last groupby was, and set the state of the menulist
	// accordingly
	var groupBy = Application.prefs.getValue("extensions.concerts.groupby",
			"artist");
	var groupMenuList = document.getElementById("group-menulist");
	for (var i=0; i<groupMenuList.itemCount; i++) {
		if (groupMenuList.getItemAtIndex(i).value == groupBy) {
			groupMenuList.selectedIndex = i;
			break;
		}
	}

	gMetrics.metricsInc("concerts", "servicepane.clicked", "");
	// Register our UI display callback with the Songkick object
	if (!this.skSvc.hasDisplayCallback()) {
		var displayCB = new this.displayCallback(this);
		displayCB.wrappedJSObject = displayCB;
		this.skSvc.registerDisplayCallback(displayCB);
	}

	if (Application.prefs.get("extensions.concerts.firstrun").value) {
		// Load the first run page in the deck
		var deck = document.getElementById("concerts-deck");
		deck.setAttribute("selectedIndex", 1);
		ConcertOptions.init();
	} else {
		if (this.skSvc.concertRefreshRunning) {
			// If the data refresh is already happening, switch to the progress
			// Switch the deck to the loading page
			var deck = document.getElementById("concerts-deck");
			deck.setAttribute("selectedIndex", 2);
			var label = document.getElementById("loading-label");
			var progressbar = document.getElementById("loading-progress");
			label.value = this.skSvc.progressString;
			progressbar.value = this.skSvc.progressPercentage;
			this.waitForRefreshToFinish(this);
		} else {
			// Otherwise populate the fields in the options page, and continue
			// to the listing view
			ConcertOptions.init();
			this.browseConcerts(this);
		}
	}
}

ConcertTicketing.waitForRefreshToFinish = function(self) {
	if (Components.classes["@songbirdnest.com/Songbird/Concerts/Songkick;1"]
		.getService(Components.interfaces.sbISongkick).concertRefreshRunning)
	{
		setTimeout(this.waitForRefreshToFinish(self), 100);
	} else {
		self.browseConcerts(self);
	}

}

ConcertTicketing.editLocation = function() {
	// Save our current selected deck page, so if the user cancels we can
	// switch back to it
	var deck = document.getElementById("concerts-deck");
	deck.setAttribute("previous-selected-deck", deck.selectedIndex);
	
	// Hide the stuff we don't want to display
	document.getElementById("pref-about").style.visibility = "hidden";
	document.getElementById("about-text").style.visibility = "hidden";
	document.getElementById("pref-library").style.visibility = "hidden";
	document.getElementById("library-ontour-box").style.visibility ="collapse";

	// Not strictly required, but in the event the user hit cancel, we
	// probably want to reset to their preferred location
	ConcertOptions.init();

	// Make the cancel button visible (it's hidden by default for first run)
	var cancel = document.getElementById("pref-cancel-button");
	cancel.style.visibility="visible";

	// Switch to the location edit deck page
	deck.setAttribute("selectedIndex", 1);
}

ConcertTicketing.displayCallback = function(ticketingObj) {
	this.label = document.getElementById("loading-label"),
	this.progressbar = document.getElementById("loading-progress");
	this.concertTicketing = ticketingObj;
},
ConcertTicketing.displayCallback.prototype = {
	loadingMessage : function(str) {
		this.label.value = str;
	},
	loadingPercentage : function(pct) {
		this.progressbar.value = pct;
	},
	timeoutError : function() {
		var deck = document.getElementById("concerts-deck");
		deck.setAttribute("selectedIndex", 4);
	},
	showListings : function() {
		this.concertTicketing.browseConcerts(this.concertTicketing);
	},
	updateConcertCount : function() {
		songbirdMainWindow.Concerts.updateConcertCount()
	},
	alert : function(str) { window.alert(str); },
}

// Initiate a synchronous database refresh.  This can only be triggered after
// first run, or if the user goes and changes their location
ConcertTicketing.loadConcertData = function(city) {
	// Switch the deck to the loading page
	var deck = document.getElementById("concerts-deck");
	deck.setAttribute("selectedIndex", 2);

	// First run is over
	if (Application.prefs.getValue("extensions.concerts.firstrun", false)) {
		// toggle first-run
		Application.prefs.setValue("extensions.concerts.firstrun", false);

		// setup the smart playlist
		songbirdMainWindow.Concerts._setupOnTourPlaylist();
	}

	// Load the new data
	var ret = this.skSvc.refreshConcerts(false, city);
	songbirdMainWindow.Concerts.updateConcertCount();
	if (!ret)
		this.browseConcerts(this);
}

ConcertTicketing.showNoConcerts = function() {
	var deck = document.getElementById("concerts-deck");
	deck.setAttribute("selectedIndex", 3);

	deck = document.getElementById("no-results-deck");
	var easterEgg = Application.prefs.getValue("extensions.concerts.epic", 0);
	if (easterEgg == "9x6") {
		deck.setAttribute("selectedIndex", 1);
		var label = document.getElementById("epic-city");
		label.value += this.skSvc.getLocationString(this.pCountry, this.pState,
				this.pCity);
	} else {
		var count = this.skSvc.getConcertCount(false);
		var label;
		var button;
		if (count == 0 || easterEgg == "54") {
			// no concerts found, period
			deck.setAttribute("selectedIndex", 0);
			label = document.getElementById("noresults-city");
			label.value = this._strings.getString("yourCitySucks") +
				" " + this.skSvc.getLocationString(this.pCountry,
						this.pState, this.pCity);
			button = document.getElementById("noresults-seeallconcerts-city");
			button.style.visibility = "hidden";
		} else {
			// no library artist concerts found, select the right deck
			deck.setAttribute("selectedIndex", 0);

			// show error messages
			// "Well that's lame"
			label = document.getElementById("noresults-city-1");
			label.value = this._strings.getString("noLibLame");

			// "None of the artists in your library are touring..."
			var city = " " + this.skSvc.getCityString(this.pCity);
			if (this.pCity == 26330)
				city = " " + this._strings.getString("sfCityPrefix") + city;
			label = document.getElementById("noresults-city-2");
			label.value = this._strings.getString("noLibArtistsTouring") +
				city + ".";

			// "If that changes..."
			label = document.getElementById("noresults-city-3");
			label.value = this._strings.getString("noLibArtistsTouring2");
			label = document.getElementById("noresults-city-4");
			label.value = this._strings.getString("noLibArtistsTouring3");
			
			// Set the actual button text
			button = document.getElementById("noresults-seeallconcerts-city");
			button.label = this._strings.getString("seeAllConcerts") + city;
		}
	}
}

ConcertTicketing.showTimeoutError = function() {
	var deck = document.getElementById("concerts-deck");
	deck.setAttribute("selectedIndex", 4);
}

ConcertTicketing.openCityPage = function() {
	var url = Application.prefs.getValue("extensions.concerts.citypage", "");
	gBrowser.loadOneTab(url + "?p=21");
}

ConcertTicketing.openProviderPage = function() {
	var url;
	if (typeof(this.skSvc) != "undefined")
		url = this.skSvc.providerURL();
	else
		url = Cc["@songbirdnest.com/Songbird/Concerts/Songkick;1"]
				.getService(Ci.sbISongkick).providerURL();

	var city = Application.prefs.getValue("extensions.concerts.city", 0);
	if (city != 0)
		url += "?p=21&user_location=" + city;
	gBrowser.loadOneTab(url);
}

/***************************************************************************
 * Called when the user clicks "Play" next to the main artist name in the
 * artist grouping view of upcoming concerts
 ***************************************************************************/
ConcertTicketing.playArtist = function(e) {
	var artistName = this.getAttribute("artistName");
	
	gMetrics.metricsInc("concerts", "browse.view.artist.playartist", "");
	var list = songbirdMainWindow.Concerts.touringPlaylist;
	var view = list.createView();
	var cfs = view.cascadeFilterSet;
	
	cfs.appendSearch(["*"], 1);
	cfs.appendFilter(SBProperties.genre);
	cfs.appendFilter(SBProperties.artistName);
	cfs.appendFilter(SBProperties.albumName);

	cfs.clearAll();
	cfs.set(2, [artistName], 1);

	gPPS.playView(view, 0);
}

/***************************************************************************
 * Scrolls the iframe to the selected index block when the user clicks on
 * one of the letter or month index links in the chrome
 ***************************************************************************/
ConcertTicketing.indexJump = function(e) {
	var iframe = document.getElementById("concert-listings");
	this._browseDoc = iframe.contentWindow.document;

	var anchor;
	if (this.id.indexOf("letter-index-") >= 0) {
		var letter = this.value;
		anchor = this._browseDoc.getElementById("indexLetter-" + letter);
	} else {
		var dateComponent = this.id.split("-")[2];
		anchor = this._browseDoc.getElementById("indexDate-" + dateComponent);
	}
	if (anchor) {
		var aLeft = anchor.offsetLeft;
		var aTop = anchor.offsetTop;
		iframe.contentWindow.scrollTo(0, aTop);
	}
}


ConcertTicketing.browseConcerts = function(ticketingObj) {
	if (this.skSvc.drawingLock)
		return;
	this.skSvc.drawingLock = true;

	// Switch to the listing view
	var deck = document.getElementById("concerts-deck");
	deck.setAttribute("selectedIndex", 0);

	// Display the user's location in the top-right label
	this.pCountry = Application.prefs.getValue("extensions.concerts.country",0);
	this.pState = Application.prefs.getValue("extensions.concerts.state",0);
	this.pCity = Application.prefs.getValue("extensions.concerts.city", 0);
	var regionLabel = document.getElementById("label-myregion");
	var locationString = this.skSvc.getLocationString(this.pCountry,
			this.pState, this.pCity);
	regionLabel.value = locationString;
	regionLabel.className = "text-link";
	regionLabel.addEventListener("click",
			self.ConcertTicketing.openCityPage, false);

	this._bodyNode = this._browseDoc.getElementsByTagName("body")[0];

	// Clear any existing results
	while (this._bodyNode.firstChild) {
		this._bodyNode.removeChild(this._bodyNode.firstChild);
	}
	// Add the Songkick logo
	var skDiv = this.createBlock("powered-by-songkick");
	skDiv.style.width = "100%";
	skDiv.style.textAlign = "right";
	var skImg = this._browseDoc.createElement("img");
	skImg.src = "chrome://concerts/content/songkick.png";
	skImg.className = "clickable";
	skImg.addEventListener("click", this.openProviderPage, false);
	skDiv.appendChild(skImg);
	this._bodyNode.appendChild(skDiv);
	
	flushDisplay();

	var easterEgg = Application.prefs.getValue("extensions.concerts.epic", 0);
	if (easterEgg == "9x6" || (easterEgg == "42" && this.filterLibraryArtists)
			|| (easterEgg == "54"))
	{
		ConcertTicketing.showNoConcerts();
		return;
	}
	if (easterEgg == "doctorwho") {
		ConcertTicketing.showTimeoutError();
		return;
	}
	
	var groupBy = Application.prefs.getValue("extensions.concerts.groupby",
			"artist");
	var concertsShown;
	if (groupBy == "artist" || groupBy == "venue") {
		// Reset the letter indices
		var letters = document.getElementById("box-index-letter").childNodes;
		for (letter in letters) {
			letters[letter].className="index-letter";
		}

		// Show the letter indices
		var deck = document.getElementById("index-deck");
		deck.setAttribute("selectedIndex", 0);

		if (groupBy == "artist")
			concertsShown = this.browseArtists();
		else
			concertsShown = this.browseVenues();
	} else {
		// Clear the calendar indices
		var dateIndexBox = document.getElementById("box-index-date");
		while (dateIndexBox.firstChild)
			dateIndexBox.removeChild(dateIndexBox.firstChild);

		// Populate the calendar indices
		var myDate = new Date();
		myDate.setDate(1);
		for (i=0; i<6; i++) {
			var mon = myDate.getMonth();
			var year = myDate.getFullYear();
			var dateStr = myDate.toLocaleFormat("%b %Y");
			var dateLabel = document.createElement("label");
			dateLabel.setAttribute("value", dateStr);
			dateLabel.className = "index-date";
			dateLabel.id = "date-index-" + mon + year;
			dateIndexBox.appendChild(dateLabel);
			myDate.setMonth(mon+1);
		}

		// Show the calendar indices 
		var deck = document.getElementById("index-deck");
		deck.setAttribute("selectedIndex", 1);

		concertsShown = this.browseDates();
	}

	if (concertsShown > 0) {
		var ft = this.createBlock("ft");
		ft.id = "ft";
		var poweredBy = this.createBlock("poweredBy");
		var url = this.skSvc.providerURL();
		var city = Application.prefs.getValue("extensions.concerts.city", 0);
		if (city != 0)
			url += "?p=21&user_location=" + city;
		poweredBy.innerHTML = this._strings.getString("poweredBy") + 
			" <a target='_blank' href='" + url + "'>Songkick</a>. "
			+ this._strings.getString("tosPrefix") + 
			" <a target='_blank' href='http://www.songkick.com/terms?p=21'>" +
			this._strings.getString("tosLink") + "</a>.";
		ft.appendChild(poweredBy);

		var lastUpdated = this.createBlock("lastUpdated");
		var ts = parseInt(1000*
			Application.prefs.getValue("extensions.concerts.lastupdated", 0));
		if (ts > 0) {
			var dateString =
				new Date(ts).toLocaleFormat("%a, %b %e, %Y at %H:%M.");
			lastUpdated.innerHTML = this._strings.getString("lastUpdated") +
				" <span class='date'>" + dateString + "</span>";
			ft.appendChild(lastUpdated);
		}
		this._bodyNode.appendChild(ft);
	}

	// Debug
	/*
	var html = this._bodyNode.innerHTML;
	var textbox = this._browseDoc.createElement("textarea");
	textbox.width=50;
	textbox.height=50;
	this._bodyNode.appendChild(textbox);
	textbox.value = html;
	*/
	
	this.skSvc.drawingLock = false;
}

ConcertTicketing.browseDates = function() {
	var lastDate = "";
	var dateBlock = null;
	var concertTable = null;
	var venueConcertBlock = null;
	var concerts = new this.skSvc.concertEnumerator("date",
			this.filterLibraryArtists);
	var concertsShown = 0;

	var today = new Date();
	var todayMon = today.getMonth();
	var todayDate = today.getDate();

	gMetrics.metricsInc("concerts", "browse.view.date", "");
	while (concerts.hasMoreElements()) {
		var concert = concerts.getNext().wrappedJSObject;

		var thisDateObj = new Date(concert.ts * 1000);
		var thisIndex = thisDateObj.getMonth() + "" + thisDateObj.getFullYear();
		var thisDate = thisDateObj.getFullYear() + '-' + thisDateObj.getMonth()
				+ '-' + thisDateObj.getDate();

		// Don't show past concerts
		if ((thisDateObj.getMonth() < todayMon) ||
				(thisDateObj.getMonth() == todayMon &&
				 thisDateObj.getDate() < todayDate)) {
			continue;
		}

		var dateIndex = document.getElementById("date-index-" + thisIndex);
		if (dateIndex == null) {
			continue;
		}
		dateIndex.className = "index-date text-link";
		dateIndex.addEventListener("click", ConcertTicketing.indexJump, false);

		if (thisDate != lastDate) {
			// Create the block for concert listings of the same letter index
			var dateDiv = this.createBlock("indexDiv");

			// Create the letter index block
			var dateIndexContainer = this.createDateBlock(thisDateObj);

			// Create the actual concert listing block for this date
			dateBlock = this.createBlock("concertListing");
			dateBlock.className += " concertListingDate";

			// Create a new concert listing block
			var concertTableBlock = this.createBlock("artistBlock");
			
			// Create the table for concerts
			concertTable = this.createTableDateView();
			concertTableBlock.appendChild(concertTable);

			// Assemble the pieces together
			dateBlock.appendChild(concertTableBlock);
			dateDiv.appendChild(dateIndexContainer);
			dateDiv.appendChild(dateBlock);
			this._bodyNode.appendChild(dateDiv);
			flushDisplay();
		}
		
		// Create the table row representing this concert
		var thisConcert = this.createRowDateView(concert);
		concertTable.appendChild(thisConcert);

		lastDate = thisDate;
		concertsShown++;
	}
	
	if (concertsShown == 0) {
		if (Application.prefs.getValue("extensions.concerts.networkfailure",
					false))
			ConcertTicketing.showTimeoutError();
		else
			ConcertTicketing.showNoConcerts();
	}

	return concertsShown;
}


ConcertTicketing.browseVenues = function() {
	var lastLetter = "";
	var lastVenue = "";
	var concertBlock = null;
	var venueConcertBlock = null;
	var thisMainVenueAnchor = null;
	var concerts = new this.skSvc.concertEnumerator("venue",
			this.filterLibraryArtists);

	var concertsShown = 0;
	while (concerts.hasMoreElements()) {
		var concert = concerts.getNext().wrappedJSObject;

		var thisLetter = concert.venue[0].toUpperCase();
		var letterIdx = document.getElementById("letter-index-" + thisLetter);
		letterIdx.className = "index-letter text-link";
		letterIdx.addEventListener("click", ConcertTicketing.indexJump, false);
		if (thisLetter != lastLetter) {
			// Create the block for concert listings of the same letter index
			var letterDiv = this.createBlock("indexDiv");

			// Create the letter index block
			var letterIndexContainer = this.createLetterBlock(thisLetter);

			// Create the actual concert listing block for this letter
			concertBlock = this.createBlock("concertListing");
			concertBlock.className += " concertListingLetter";

			// Assemble the pieces together
			letterDiv.appendChild(letterIndexContainer);
			letterDiv.appendChild(concertBlock);
			this._bodyNode.appendChild(letterDiv);
		}
		if (concert.venue != lastVenue) {
			// Create a new venue block
			var venueBlock = this.createBlock("artistBlock");

			// Create the main venue title
			var venueName = this.createBlock("mainArtistName");
			thisMainVenueAnchor = this._browseDoc.createElement("a");
			thisMainVenueAnchor.setAttribute("target", "_blank");
			var venueNameText = this._browseDoc.createTextNode(concert.venue);
			thisMainVenueAnchor.appendChild(venueNameText);
			venueName.appendChild(thisMainVenueAnchor);
			venueBlock.appendChild(venueName);

			// Create the table for concerts
			venueConcertBlock = this.createTableVenueView();
			venueBlock.appendChild(venueConcertBlock);

			// Attach the venue block to the concert listing block
			concertBlock.appendChild(venueBlock);
		}
		
		// Create the table row representing this concert
		var thisConcert = this.createRowVenueView(concert);
		venueConcertBlock.appendChild(thisConcert);

		lastLetter = thisLetter;
		lastVenue = concert.venue;
		
		concertsShown++;
	}
	
	if (concertsShown == 0) {
		if (Application.prefs.getValue("extensions.concerts.networkfailure",
					false))
			ConcertTicketing.showTimeoutError();
		else
			ConcertTicketing.showNoConcerts();
	}

	return concertsShown;
}

ConcertTicketing.browseArtists = function() {
	var lastLetter = "";
	var lastArtist = "";
	var concertBlock = null;
	var artistConcertBlock = null;
	var thisMainArtistAnchor = null;
	var concerts = this.skSvc.artistConcertEnumerator(
			this.filterLibraryArtists);

	var concertsShown = 0;
	
	var contentsNode = this._browseDoc.createElement("div");
	this._bodyNode.appendChild(contentsNode);
	
	var today = new Date();
	var todayMon = today.getMonth();
	var todayDate = today.getDate();

	gMetrics.metricsInc("concerts", "browse.view.artist", "");
	while (concerts.hasMoreElements()) {
		var concert = concerts.getNext().wrappedJSObject;

		var thisDateObj = new Date(concert.ts * 1000);
		var thisIndex = thisDateObj.getMonth() + "" + thisDateObj.getFullYear();
		var thisDate = thisDateObj.getFullYear() + '-' + thisDateObj.getMonth()
				+ '-' + thisDateObj.getDate();

		// Don't show past concerts
		if ((thisDateObj.getMonth() < todayMon) ||
				(thisDateObj.getMonth() == todayMon &&
				 thisDateObj.getDate() < todayDate)) {
			continue;
		}
		var thisLetter = concert.artistname[0].toUpperCase();
		if (thisLetter < 'A' || thisLetter > 'Z')
			thisLetter = '#';
		var letterIdx = document.getElementById("letter-index-" + thisLetter);
		if (letterIdx == null)
			return;
		letterIdx.className = "index-letter text-link";
		letterIdx.addEventListener("click", this.indexJump, false);
		if (thisLetter != lastLetter) {
			// Create the block for concert listings of the same letter index
			var letterDiv = this.createBlock("indexDiv");

			// Create the letter index block
			var letterIndexContainer = this.createLetterBlock(thisLetter);

			// Create the actual concert listing block for this letter
			concertBlock = this.createBlock("concertListing");
			concertBlock.className += " concertListingLetter";

			// Assemble the pieces together
			letterDiv.appendChild(letterIndexContainer);
			letterDiv.appendChild(concertBlock);
			//this._bodyNode.appendChild(letterDiv);
			contentsNode.appendChild(letterDiv);
			flushDisplay();
		}
		if (concert.artistname != lastArtist) {
			// Create a new artist block
			var artistBlock = this.createBlock("artistBlock");

			// Create the main concert title
			var artistName = this.createBlock("mainArtistName", true);
			thisMainArtistAnchor = this._browseDoc.createElement("a");
			this.makeLink(thisMainArtistAnchor, "", "artist.main");
			var artistNameText =
				this._browseDoc.createTextNode(concert.artistname);
			thisMainArtistAnchor.appendChild(artistNameText);
			artistName.appendChild(thisMainArtistAnchor);
			artistBlock.appendChild(artistName);

			if (concert.libartist == 1 && this.showPlayLink) {
				// Create the play link
				var playBlock = this.createBlock("playBlock", true);
				var playLink = this._browseDoc.createElement("img");
				playLink.className = "ticketImage";
				playLink.src = "chrome://concerts/skin/icon-play.png";
				playBlock.className = "playLink";
				playBlock.appendChild(playLink);
				playBlock.setAttribute("artistName", concert.artistname);
				playBlock.addEventListener("click", this.playArtist, false);
				artistBlock.appendChild(playBlock);
			}

			// Create the table for concerts
			artistConcertBlock = this.createTableArtistView();
			artistBlock.appendChild(artistConcertBlock);

			// Attach the artist block to the concert listing block
			concertBlock.appendChild(artistBlock);
		}
		
		// Create the table row representing this concert
		var thisConcert = this.createRowArtistView(concert,
				thisMainArtistAnchor);
		artistConcertBlock.appendChild(thisConcert);

		lastLetter = thisLetter;
		lastArtist = concert.artistname;
		
		concertsShown++;
	}
	
	if (concertsShown == 0) {
		if (Application.prefs.getValue("extensions.concerts.networkfailure",
					false))
			ConcertTicketing.showTimeoutError();
		else
			ConcertTicketing.showNoConcerts();
	}

	return concertsShown;
}

// Takes a letter, and returns an index block for it
ConcertTicketing.createLetterBlock = function(letter) {
	// letter index (LHS)
	var letterIndexContainer = this.createBlock("letterIndexContainer");
	var letterIndex = this.createBlock("letterIndex");
	letterIndex.id = "indexLetter-" + letter;
	var letterIndexText = this._browseDoc.createTextNode(letter);
	letterIndex.appendChild(letterIndexText);
	letterIndexContainer.appendChild(letterIndex);
	return (letterIndexContainer);
}

ConcertTicketing.openDateLink = function(e) {
	var citypage=Application.prefs.getValue("extensions.concerts.citypage", "");
	gMetrics.metricsInc("concerts", "browse.link.datebox", "");
	if (citypage) {
		var year = this.getAttribute("year");
		var month = parseInt(this.getAttribute("month")) + 1;
		var date = this.getAttribute("date");
		gBrowser.loadOneTab(citypage + "?p=21" +
				"&d=" + year + "-" + month + "-" + date);
	}
}

// Takes a date, and returns an index block for it
ConcertTicketing.createDateBlock = function(dateObj) {
	var dateIndexContainer = this.createBlock("dateIndexContainer");
	var boxBlock = this.createBlock("dateIndex-box");
	boxBlock.addEventListener("click", ConcertTicketing.openDateLink, false);
	boxBlock.setAttribute("year", dateObj.getFullYear());
	boxBlock.setAttribute("month", dateObj.getMonth());
	boxBlock.setAttribute("date", dateObj.getDate());
	boxBlock.style.cursor = "pointer";
	var month = this.createBlock("dateIndex-month");
	var date = this.createBlock("dateIndex-date");
	var day = this.createBlock("dateIndex-day");
	dateIndexContainer.id = "indexDate-" + dateObj.getMonth() +
		dateObj.getFullYear();
	var monthText =
		this._browseDoc.createTextNode(dateObj.toLocaleFormat("%b"));
	var dateText = this._browseDoc.createTextNode(dateObj.toLocaleFormat("%d"));
	var dayText = this._browseDoc.createTextNode(dateObj.toLocaleFormat("%a"));
	month.appendChild(monthText);
	day.appendChild(dayText);
	date.appendChild(dateText);
	boxBlock.appendChild(month);
	boxBlock.appendChild(date);
	dateIndexContainer.appendChild(boxBlock);
	dateIndexContainer.appendChild(day);
	return (dateIndexContainer);
}

/***************************************************************************
 * Routines for building the actual table objects for listing individual
 * concerts within
 ***************************************************************************/
ConcertTicketing.createTableArtistView = function() {
	var table = this.createTable();
	var headerRow = this._browseDoc.createElement("tr");
	var dateCol = this.createTableHeader("tableHeaderDate", "date");
	var gCalCol = this.createTableHeader("tableHeaderGCal", "gcal");
	var artistsCol = this.createTableHeader("tableHeaderOtherArtists",
			"artists");
	var venueCol = this.createTableHeader("tableHeaderVenue", "venue");
	var ticketCol = this.createTableHeader("tableHeaderTickets", "tickets");
	headerRow.appendChild(dateCol);
	if (this.showGCal)
		headerRow.appendChild(gCalCol);
	headerRow.appendChild(artistsCol);
	headerRow.appendChild(venueCol);
	headerRow.appendChild(ticketCol);
	table.appendChild(headerRow);
	return (table);
}

ConcertTicketing.createTableVenueView = function() {
	var table = this.createTable();
	var headerRow = this._browseDoc.createElement("tr");
	var ticketCol = this.createTableHeader("tableHeaderTickets", "tickets");
	var dateCol = this.createTableHeader("tableHeaderDate", "date");
	var artistsCol = this.createTableHeader("tableHeaderArtists", "artists");
	headerRow.appendChild(ticketCol);
	headerRow.appendChild(dateCol);
	headerRow.appendChild(artistsCol);
	table.appendChild(headerRow);
	return (table);
}

ConcertTicketing.createTableDateView = function() {
	var table = this.createTable();
	var headerRow = this._browseDoc.createElement("tr");
	var gCalCol = this.createTableHeader("tableHeaderGCal", "gcal");
	var artistsCol = this.createTableHeader("tableHeaderArtists", "artists");
	var venueCol = this.createTableHeader("tableHeaderVenue", "venue");
	var ticketCol = this.createTableHeader("tableHeaderTickets", "tickets");
	if (this.showGCal)
		headerRow.appendChild(gCalCol);
	headerRow.appendChild(artistsCol);
	headerRow.appendChild(venueCol);
	headerRow.appendChild(ticketCol);
	table.appendChild(headerRow);
	return (table);
}

ConcertTicketing.createTable = function() {
	var table = this._browseDoc.createElement("table");
	table.setAttribute("cellpadding", "0");
	table.setAttribute("cellspacing", "0");
	table.setAttribute("border", "0");
	return (table);
}

// str is a name in the .properties localised strings
// className is the class to apply to the TH cell
ConcertTicketing.createTableHeader = function(str, className) {
	var col = this._browseDoc.createElement("th");
	col.className = className;
	if (this._strings.getString(str) == "")
		col.innerHTML = "&nbsp;";
	else {
		var colLabel =
			this._browseDoc.createTextNode(this._strings.getString(str));
		col.appendChild(colLabel);
	}
	return (col);
}
/***************************************************************************
 * Routines for building the individual concert listing rows, i.e. the table
 * row representing each individual concert for each of the 3 views
 ***************************************************************************/
ConcertTicketing.createRowArtistView = function(concert, mainAnchor) {
	var row = this._browseDoc.createElement("tr");
	var ticketCol = this.createColumnTickets(concert);
	var dateCol = this.createColumnDate(concert);
	var gcalCol = this.createColumnGCal(concert);
	var venueCol = this.createColumnVenue(concert);

	// Artists playing - logic is slightly different from the other venue &
	// date views since we don't want to show the artist that we're already
	// listed under (for the "main index"), and we need to update the main
	// index anchor href
	var otherArtistsCol = this._browseDoc.createElement("td");
	otherArtistsCol.className = "artists";
	var first = true;
	var artists = concert.artists;
	for (i in artists) {
		if (artists[i].name == concert.artistname) {
			mainAnchor.setAttribute("href",
					this.appendCityParam(artists[i].url));
			continue;
		}
		if (!first) {
			otherArtistsCol.appendChild(this._browseDoc.createTextNode(", "));
		} else {
			first = false;
		}
		var anchor = this._browseDoc.createElement("a");
		this.makeLink(anchor, this.appendCityParam(artists[i].url),
				"artist.other");
		var anchorLabel = this._browseDoc.createTextNode(artists[i].name);
		anchor.appendChild(anchorLabel);
		otherArtistsCol.appendChild(anchor);
	}
	if (otherArtistsCol.firstChild == null)
		otherArtistsCol.innerHTML = "&nbsp;";

	row.appendChild(dateCol);
	if (this.showGCal)
		row.appendChild(gcalCol);
	row.appendChild(otherArtistsCol);
	row.appendChild(venueCol);
	row.appendChild(ticketCol);
	return (row);
}

ConcertTicketing.createRowVenueView = function(concert) {
	var row = this._browseDoc.createElement("tr");
	var ticketCol = this.createColumnTickets(concert);
	var dateCol = this.createColumnDate(concert);
	var artistsCol = this.createColumnArtists(concert);
	row.appendChild(ticketCol);
	row.appendChild(dateCol);
	row.appendChild(artistsCol);
	return (row);
}

ConcertTicketing.createRowDateView = function(concert) {
	var row = this._browseDoc.createElement("tr");
	var ticketCol = this.createColumnTickets(concert);
	var gcalCol = this.createColumnGCal(concert);
	var artistsCol = this.createColumnArtists(concert);
	var venueCol = this.createColumnVenue(concert);
	if (this.showGCal)
		row.appendChild(gcalCol);
	row.appendChild(artistsCol);
	row.appendChild(venueCol);
	row.appendChild(ticketCol);
	return (row);
}

/***************************************************************************
 * Routine for opening links - we need it as a separate routine so we can
 * do metrics reporting, in addition to just opening the link
 ***************************************************************************/
ConcertTicketing.openAndReport = function(e) {
	var metric = this.getAttribute("metric-key");
	gMetrics.metricsInc("concerts", "browse.link." + metric, "");
	gBrowser.loadOneTab(this.href);
	e.preventDefault();
	return false;
}
ConcertTicketing.makeLink = function(el, url, metric) {
	el.href = url;
	el.setAttribute("metric-key", metric);
	el.addEventListener("click", this.openAndReport, true);
}

// Adds Songbird's partner code & user location
ConcertTicketing.appendCityParam = function(url) {
	return (url + "?p=21&user_location=" + this.pCity);
}
// Add's Songbird's partner code only
ConcertTicketing.appendPartnerParam = function(url) {
	return (url + "?p=21");
}

/***************************************************************************
 * Routines for building the individual column components of each concert
 * listing table row, e.g. the "Date" column, or the "Artists" column, etc.
 ***************************************************************************/
ConcertTicketing.createColumnTickets = function(concert) {
	var ticketCol = this._browseDoc.createElement("td");
	ticketCol.className = "tickets";
	if (concert.tickets) {
		var ticketAnchor = this._browseDoc.createElement("a");
		this.makeLink(ticketAnchor, this.appendPartnerParam(concert.url),
				"tickets");
		ticketAnchor.setAttribute("title",
				this._strings.getString("tableTicketsTooltip"));
		ticketAnchor.className = "get-tickets";
		ticketAnchor.innerHTML = this._strings.getString("ticketButtonLabel");
		ticketCol.appendChild(ticketAnchor);
	} else {
		ticketCol.innerHTML = "&nbsp;"
	}

	return (ticketCol);
}

ConcertTicketing.createColumnDate = function(concert) {
	var dateCol = this._browseDoc.createElement("td");
	dateCol.className = "date";
	var dateObj = new Date(concert.ts*1000);
	var dateStr = dateObj.toLocaleFormat(this.dateFormat);
	var dateColLabel = this._browseDoc.createTextNode(dateStr);
	var citypage = Application.prefs.getValue("extensions.concerts.citypage",
			"");
	if (citypage != "") {
		var dateFormat = dateObj.toLocaleFormat("%Y-%m-%d");
		var dateAnchor = this._browseDoc.createElement("a");
		this.makeLink(dateAnchor, this.appendPartnerParam(concert.url),
				"tickets");
		dateAnchor.setAttribute("title",
				this._strings.getString("tableTicketsTooltip"));
		dateAnchor.appendChild(dateColLabel);
		dateCol.appendChild(dateAnchor);
	} else {
		dateCol.appendChild(dateColLabel);
	}

	return (dateCol);
}

ConcertTicketing.createColumnGCal = function(concert) {
	var dateObj = new Date(concert.ts*1000);
	var dateStr = dateObj.toLocaleFormat("%Y%m%d"); // T%H%M%SZ");
	var url = "http://www.google.com/calendar/event?action=TEMPLATE";
	url += "&text=" + escape(concert.title);
	url += "&details=";
	for (artist in concert.artists) {
		url += escape(concert.artists[artist].name) + ",";
	}
	// trim the last ,
	url = url.substr(0, url.length-1);
	url += "&location=" + escape(concert.venue) + "," + escape(concert.city);
	url += "&dates=" + dateStr + "/" + dateStr;

	var gCalLinkCol = this._browseDoc.createElement("td");
	gCalLinkCol.className = "gcal";
	var gCalLink = this._browseDoc.createElement("a");
	this.makeLink(gCalLink, url, "gcal");
	gCalLink.setAttribute("title", this._strings.getString("tableGCalTooltip"));
	
	var gCalImage = this._browseDoc.createElement("img");
	gCalImage.src = "chrome://concerts/skin/gcal.png";
	gCalImage.className = "gcalImage";
	gCalLink.appendChild(gCalImage);

	gCalLinkCol.appendChild(gCalLink);

	return (gCalLinkCol);
}

ConcertTicketing.createColumnArtists = function(concert) {
	/*
	 * Construct the artists playing string
	 * Take the concert title, and for each artist listed as playing at this
	 * concert, mask it out of the concert title.  After all the artists have
	 * been masked out, test to see if the concert title consists of anything
	 * other than punctuation.  If it doesn't, then the title was just a list
	 * of artists - and don't display it.  If it's got non-punctuation chars,
	 * then we'll classify it as a concert/festival name and list it as
	 * "Festival Name with Artist1, Artist2" 
	 */
	var artists = concert.artists;
	var artistsCol = this._browseDoc.createElement("td");
	artistsCol.className = "artists";
	var concertTitle = concert.title;
	var first = true;
	var headlinerFound = false;
	var headlinerNode;
	for (i in artists) {
		// Comma separate the list of artists
		var commaNode = null;
		if (!first) {
			commaNode = this._browseDoc.createTextNode(", ");
		}
		// Linkify the artist name
		var anchor = this._browseDoc.createElement("a");
		this.makeLink(anchor, this.appendCityParam(artists[i].url),
				"artist.other");
		var anchorLabel = this._browseDoc.createTextNode(artists[i].name);
		anchor.appendChild(anchorLabel);

		// Test to see if the concert title is the exact same string as this
		// artist name - if so, then this artist is the headliner and should
		// be called out first, otherwise append the artist name/link to the
		// column
		if (artists[i].name == concert.title) {
			headlinerFound = true;
			headlinerNode = anchor;
		} else {
			if (commaNode != null)
				artistsCol.appendChild(commaNode);
			artistsCol.appendChild(anchor);
			first = false;
		}

		// Mask it out of the concert title
		concertTitle = concertTitle.replace(artists[i].name, "");
	}
	/*
	 * XXX Taking this logic out for now - it'd work really nicely if we had
	 * consistently clean concert titles, but we don't
	 */
	/*
	if (!headlinerFound) {
		concertTitle = concertTitle.replace(/[\s!\.:\&;\(\)\/]/gi, "");
		if (concertTitle.length > 0) {
			var concertNode = this._browseDoc.createTextNode(concert.title +
					" featuring ");
			artistsCol.insertBefore(concertNode, artistsCol.firstChild);
		}
	} else {
		if (!first) {
			var withNode = this._browseDoc.createTextNode(" with ");
			artistsCol.insertBefore(withNode, artistsCol.firstChild);
		}
		artistsCol.insertBefore(headlinerNode, artistsCol.firstChild);
	}
	*/
	if (headlinerFound) {
		if (!first) {
			var withNode = this._browseDoc.createTextNode(" with ");
			artistsCol.insertBefore(withNode, artistsCol.firstChild);
		}
		artistsCol.insertBefore(headlinerNode, artistsCol.firstChild);
	}

	return (artistsCol);
}

ConcertTicketing.createColumnVenue = function(concert) {
	var venueCol = this._browseDoc.createElement("td");
	venueCol.className = "venue";
	var anchor = this._browseDoc.createElement("a");
	this.makeLink(anchor, this.appendPartnerParam(concert.venueURL), "venue");
	var venueColLabel = this._browseDoc.createTextNode(concert.venue);
	anchor.appendChild(venueColLabel);
	venueCol.appendChild(anchor);

	return (venueCol);
}

/* Generic shortcut for creating a DIV or SPAN & assigning it a style class */
ConcertTicketing.createBlock = function(blockname, makeSpan) {
	var block;
	if (makeSpan)
		var block = this._browseDoc.createElement("span");
	else
		var block = this._browseDoc.createElement("div");
	block.className=blockname;
	return block;
}

/* Methods connected to the groupby menulist & filter checkbox on the chrome */
ConcertTicketing.changeFilter = function(updateCheckbox) {
	//var deck = document.getElementById("concerts-deck");
	//deck.setAttribute("selectedIndex", 2);
	
	this.filterLibraryArtists = !this.filterLibraryArtists;
	Application.prefs.setValue("extensions.concerts.filterLibraryArtists",
			this.filterLibraryArtists);
	if (this.filterLibraryArtists)
		gMetrics.metricsInc("concerts", "filter.library", "");
	else
		gMetrics.metricsInc("concerts", "filter.all", "");

	/* checks the filter checkbox (for the path taken when there are no
	   results in the user's city and they click the button to see
	   all concerts, rather than checking the checkbox themselves */
	if (updateCheckbox) {
		var checkbox = document.getElementById("checkbox-library-artists");
		checkbox.setAttribute("checked", this.filterLibraryArtists);
	}
	songbirdMainWindow.Concerts.updateConcertCount();
	flushDisplay();
	this.browseConcerts(this);
}

ConcertTicketing.groupBy = function(group) {
	Application.prefs.setValue("extensions.concerts.groupby", group);
	
	this.browseConcerts(this);
}

