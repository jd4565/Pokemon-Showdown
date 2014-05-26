/**
 * Users
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * Most of the communication with users happens here.
 *
 * There are two object types this file introduces:
 * User and Connection.
 *
 * A User object is a user, identified by username. A guest has a
 * username in the form "Guest 12". Any user whose username starts
 * with "Guest" must be a guest; normal users are not allowed to
 * use usernames starting with "Guest".
 *
 * A User can be connected to Pokemon Showdown from any number of tabs
 * or computers at the same time. Each connection is represented by
 * a Connection object. A user tracks its connections in
 * user.connections - if this array is empty, the user is offline.
 *
 * Get a user by username with Users.get
 * (scroll down to its definition for details)
 *
 * @license MIT license
 */

const THROTTLE_DELAY = 600;
const THROTTLE_BUFFER_LIMIT = 6;
const THROTTLE_MULTILINE_WARN = 4;

 var users = {};
 var prevUsers = {};
 var numUsers = 0;

var ipbans = fs.createWriteStream("config/ipbans.txt", {flags: "a"}); // do not remove this line
try {
	exports.bannedMessages = fs.readFileSync('config/bannedmessages.txt','utf8');
} catch(e) {
	exports.bannedMessages = '';
	fs.writeFileSync('config/bannedmessages.txt','','utf8');
}

try {
	userTypes = fs.readFileSync('config/types.csv','utf8'); 
} catch(e) {
	userTypes = '';
	fs.writeFileSync('config/types.csv','','utf8');
}

exports.bannedMessages = exports.bannedMessages.split('\n');

exports.readVips = function() {
	exports.vips = fs.readFile('config/vips.txt', 'utf8', function(err, data) {
		exports.vips = [];
		if (err) return exports.vips;
		data = data.split('\n');
		count = 0;
		for (var u in data) {
			count++;
			if (data[u].length > 0) exports.vips.push(data[u]);
			if (count == data.length) return exports.vips;
		}
	});
}

exports.readVips();

exports.addVip = function(user) {
	user = toId(user);
	exports.vips.push(user);
	count = 0;
	data = '';
	for (var u in exports.vips) {
		if (exports.vips[u].length > 0) data = data + exports.vips[u] + '\n';
		count++;
		if (count == exports.vips.length) {
			fs.writeFileSync('config/vips.txt',data);
			exports.readVips();
			return true;
		}
	}
}

function messageSeniorStaff (message) {
	if (!message) return false;
	for (var u in Users.users) {
		if (Users.users[u].group == '&' || Users.users[u].group == '~') {
			Users.users[u].send('|pm|~Server|'+Users.users[u].group+Users.users[u].name+'|'+message);
		}
	}
}

exports.messageSeniorStaff = messageSeniorStaff;

var bannedIps = {};
var bannedUsers = {};
var lockedIps = {};
var lockedUsers = {};

/**
 * Get a user.
 *
 * Usage:
 *   Users.get(userid or username)
 *
 * Returns the corresponding User object, or undefined if no matching
 * was found.
 *
 * By default, this function will track users across name changes.
 * For instance, if "Some dude" changed their name to "Some guy",
 * Users.get("Some dude") will give you "Some guy"s user object.
 *
 * If this behavior is undesirable, use Users.getExact.
 */

function getUser(name, exactName) {
	if (!name || name === '!') return null;
	if (name && name.userid) return name;
	var userid = toId(name);
	var i = 0;
	while (!exactName && userid && !users[userid] && i < 1000) {
		userid = prevUsers[userid];
		i++;
	}
	return users[userid];
}

/**
 * Get a user by their exact username.
 *
 * Usage:
 *   Users.getExact(userid or username)
 *
 * Like Users.get, but won't track across username changes.
 *
 * You can also pass a boolean as Users.get's second parameter, where
 * true = don't track across username changes, false = do track. This
 * is not recommended since it's less readable.
 */

function getExactUser(name) {
	return getUser(name, true);
}

function searchUser(name) {
	var userid = toId(name);
	while (userid && !users[userid]) {
		userid = prevUsers[userid];
	}
	return users[userid];
}

/*********************************************************
 * Routing
 *********************************************************/

var connections = exports.connections = {};

function socketConnect(worker, workerid, socketid, ip) {
	var id = '' + workerid + '-' + socketid;
	var connection = connections[id] = new Connection(id, worker, socketid, null, ip);

	if (ResourceMonitor.countConnection(ip)) {
		connection.destroy();
		bannedIps[ip] = '#cflood';
		return;
	}
	var checkResult = Users.checkBanned(ip);
	if (!checkResult && Users.checkRangeBanned(ip)) {
		checkResult = '#ipban';
	}
	if (checkResult) {
		console.log('CONNECT BLOCKED - IP BANNED: ' + ip + ' (' + checkResult + ')');
		if (checkResult === '#ipban') {
			connection.send("|popup|Your IP (" + ip + ") is on our abuse list and is permanently banned. If you are using a proxy, stop.");
		} else if (checkResult === '#cflood') {
			connection.send("|popup|PS is under heavy load and cannot accommodate your connection right now.");
		} else {
			connection.send("|popup|Your IP (" + ip + ") used is banned under the username '" + checkResult + "''. Your ban will expire in a few days." + (Config.appealurl ? " Or you can appeal at:\n" + Config.appealurl : ""));
		}
		return connection.destroy();
	}
	// Emergency mode connections logging
	if (Config.emergency) {
		fs.appendFile('logs/cons.emergency.log', '[' + ip + ']\n', function (err){
			if (err) {
				console.log('!! Error in emergency conns log !!');
				throw err;
			}
		});
	}

	var user = new User(connection);
	connection.user = user;
	// Generate 1024-bit challenge string.
	require('crypto').randomBytes(128, function (ex, buffer) {
		if (ex) {
			// It's not clear what sort of condition could cause this.
			// For now, we'll basically assume it can't happen.
			console.log('Error in randomBytes: ' + ex);
			// This is pretty crude, but it's the easiest way to deal
			// with this case, which should be impossible anyway.
			user.disconnectAll();
		} else if (connection.user) {	// if user is still connected
			connection.challenge = buffer.toString('hex');
			// console.log('JOIN: ' + connection.user.name + ' [' + connection.challenge.substr(0, 15) + '] [' + socket.id + ']');
			var keyid = Config.loginserverpublickeyid || 0;
			connection.sendTo(null, '|challstr|' + keyid + '|' + connection.challenge);
		}
	});
	user.joinRoom('global', connection);

	Dnsbl.query(connection.ip, function (isBlocked) {
		/*if (isBlocked) {
			connection.popup("Your IP is known for abuse and has been locked. If you're using a proxy, don't.");
			if (connection.user) connection.user.lock(true);
		}*/
		if (isBlocked) {
			switch (isBlocked) {
				case 'sbl.spamhaus.org':
				connection.popup('Your IP is known for abuse and has been locked. If you\'re using a proxy, don\'t.');
				if (connection.user) connection.user.lock(true);
				break;
				case 'rbl.efnetrbl.org':
				connection.popup('Your IP is listed in rbl.efnetrbl.org and has been automatically banned. For more information, please visit http://rbl.efnetrbl.org/.');
				if (connection.user) connection.user.ban();
				break;
				case 'dnsbl.dronebl.org':
				connection.popup('Your IP is listed in dnsbl.dronebl.org and has been automatically banned. For more information, please visit http://dronebl.org/lookup?ip='+connection.ip+'.');
				if (connection.user) connection.user.ban();
				break;
				case '8000.156.93.184.192.ip-port.exitlist.torproject.org':
				connection.popup('Your IP is listed as a TOR exit node and has been automatically banned.');
				if (connection.user) connection.user.ban();
				break;
				case 'http.dnsbl.sorbs.net':
				connection.popup('Your IP is known for running proxy servers and has been automatically banned.');
				if (connection.user) connection.user.ban();
				break;
				case 'socks.dnsbl.sorbs.net':
				connection.popup('Your IP is known for running proxy servers and has been automatically banned.');
				if (connection.user) connection.user.ban();
				break;
				case 'misc.dnsbl.sorbs.net':
				connection.popup('Your IP is known for running proxy servers and has been automatically banned.');
				if (connection.user) connection.user.ban();
				break;
				default:
				connection.popup('Your IP is known for abuse and has been locked. If you\'re using a proxy, don\'t.');
				if (connection.user) connection.user.lock(true);
				break;
			}
		}
	});
}

function socketDisconnect(worker, workerid, socketid) {
	var id = '' + workerid + '-' + socketid;

	var connection = connections[id];
	if (!connection) return;
	connection.onDisconnect();
}

function socketReceive(worker, workerid, socketid, message) {
	var id = '' + workerid + '-' + socketid;

	var connection = connections[id];
	if (!connection) return;

	// Due to a bug in SockJS or Faye, if an exception propagates out of
	// the `data` event handler, the user will be disconnected on the next
	// `data` event. To prevent this, we log exceptions and prevent them
	// from propagating out of this function.

	// drop legacy JSON messages
	if (message.substr(0, 1) === '{') return;

	// drop invalid messages without a pipe character
	var pipeIndex = message.indexOf('|');
	if (pipeIndex < 0) return;

	var roomid = message.substr(0, pipeIndex);
	var lines = message.substr(pipeIndex + 1);
	var room = Rooms.get(roomid);
	if (!room) room = Rooms.lobby || Rooms.global;
	var user = connection.user;
	if (!user) return;
	if (lines.substr(0, 3) === '>> ' || lines.substr(0, 4) === '>>> ') {
		user.chat(lines, room, connection);
		return;
	}
	lines = lines.split('\n');
	if (lines.length >= THROTTLE_MULTILINE_WARN && !user.frostDev) {
		connection.popup("You're sending too many lines at once. Try using a paste service like [[Pastebin]].");
		return;
	}
	// Emergency logging
	if (Config.emergency) {
		fs.appendFile('logs/emergency.log', '['+ user + ' (' + connection.ip + ')] ' + message + '\n', function (err){
			if (err) {
				console.log('!! Error in emergency log !!');
				throw err;
			}
		});
	}
	for (var i = 0; i < lines.length; i++) {
		if (user.chat(lines[i], room, connection) === false) break;
	}
}

/*********************************************************
 * User functions
 *********************************************************/

 var usergroups = {};

 function importUsergroups() {
	// can't just say usergroups = {} because it's exported
	for (var i in usergroups) delete usergroups[i];

	fs.readFile('config/usergroups.csv', function (err, data) {
		if (err) return;
		data = ('' + data).split("\n");
		for (var i = 0; i < data.length; i++) {
			if (!data[i]) continue;
			var row = data[i].split(",");
			usergroups[toId(row[0])] = (row[1] || Config.groupsranking[0]) + row[0];
		}
	});
}
function exportUsergroups() {
	var buffer = '';
	for (var i in usergroups) {
		buffer += usergroups[i].substr(1).replace(/,/g, '') + ',' + usergroups[i].substr(0, 1) + "\n";
	}
	fs.writeFile('config/usergroups.csv', buffer);
}
importUsergroups();

var bannedWords = {};
function importBannedWords() {
	fs.readFile('config/bannedwords.txt', function (err, data) {
		if (err) return;
		data = ('' + data).split("\n");
		bannedWords = {};
		for (var i = 0; i < data.length; i++) {
			if (!data[i]) continue;
			bannedWords[data[i]] = true;
		}
	});
}
function exportBannedWords() {
	fs.writeFile('config/bannedwords.txt', Object.keys(bannedWords).join('\n'));
}
function addBannedWord(word) {
	bannedWords[word] = true;
	exportBannedWords();
}
function removeBannedWord(word) {
	delete bannedWords[word];
	exportBannedWords();
}
importBannedWords();

exports.customAvatars = new Object();
function loadCustomAvatars() {
	fs.readFile('config/avatars.csv', 'utf8', function(err, data) {
		if (err) return;
		var line = data.split('\n');
		var count = 0;
		for (var u in line) {
			count++;
			if (line[u].length < 1) continue;
			var column = line[u].split(',');
			Users.customAvatars[column[0]] = column[1];
		}
	});
}
loadCustomAvatars();

function exportCustomAvatars() {
	var output = [];
	for (var u in Object.keys(Users.customAvatars)) {
		var userid = Object.keys(Users.customAvatars)[u];
		var filename = Users.customAvatars[userid];
		output.push(userid+','+filename);
	}
	fs.writeFile('config/avatars.csv', output.join('\n'));
}

function addCustomAvatar(userid, filename) {
	if (!userid || !filename) return false;
	userid = toId(userid);
	Users.customAvatars[userid] = filename;
	exportCustomAvatars();
}

function removeCustomAvatar(userid) {
	if (!userid) return false;
	userid = toId(userid);
	delete Users.customAvatars[userid];
	exportCustomAvatars();
}

// User
var User = (function () {
	function User(connection) {
		numUsers++;
		this.mmrCache = {};
		this.guestNum = numUsers;
		this.name = 'Guest ' + numUsers;
		this.named = false;
		this.renamePending = false;
		this.authenticated = false;
		this.userid = toId(this.name);
		this.group = Config.groupsranking[0];

		this.warnTimes = 0;

		//points system user variables
		this.money = 0;
		this.coins = 0;
		this.canCustomSymbol = false;
		this.canCustomAvatar = false;
		this.canAnimatedAvatar = false;
		this.canChatRoom = false;
		this.canTrainerCard = false;
		this.canFixItem = false;
		this.canChooseTour = false;
		this.canDecAdvertise = false;
		this.hasCustomSymbol = false;

		this.isAway = false;
		this.originalName = '';

		this.monoType = '';

		var trainersprites = [1, 2, 101, 102, 169, 170, 265, 266];
		this.avatar = trainersprites[Math.floor(Math.random() * trainersprites.length)];

		this.connected = true;

		if (connection.user) connection.user = this;
		this.connections = [connection];
		this.ips = {};
		this.ips[connection.ip] = 1;
		// Note: Using the user's latest IP for anything will usually be
		//       wrong. Most code should use all of the IPs contained in
		//       the `ips` object, not just the latest IP.
		this.latestIp = connection.ip;

		this.mutedRooms = {};
		this.muteDuration = {};
		this.locked = !!checkLocked(connection.ip);
		this.prevNames = {};
		this.battles = {};
		this.roomCount = {};

		// challenges
		this.challengesFrom = {};
		this.challengeTo = null;
		this.lastChallenge = 0;

		// initialize
		users[this.userid] = this;
	}

	User.prototype.staffAccess = false;
	User.prototype.frostDev = false;
	User.prototype.isSysop = false;
	User.prototype.forceRenamed = false;
	User.prototype.vip = false;

	// for the anti-spamming mechanism
	User.prototype.lastMessage = '';
	User.prototype.lastMessageTime = 0;

	User.prototype.blockChallenges = false;
	User.prototype.ignorePMs = false;
	User.prototype.lastConnected = 0;

	User.prototype.sendTo = function (roomid, data) {
		if (roomid && roomid.id) roomid = roomid.id;
		if (roomid && roomid !== 'global' && roomid !== 'lobby') data = '>' + roomid + '\n' + data;
		for (var i = 0; i < this.connections.length; i++) {
			if (roomid && !this.connections[i].rooms[roomid]) continue;
			this.connections[i].send(data);
			ResourceMonitor.countNetworkUse(data.length);
		}
	};
	User.prototype.send = function (data) {
		for (var i = 0; i < this.connections.length; i++) {
			this.connections[i].send(data);
			ResourceMonitor.countNetworkUse(data.length);
		}
	};
	User.prototype.popup = function (message) {
		this.send('|popup|' + message.replace(/\n/g, '||'));
	};
	User.prototype.getIdentity = function (roomid) {
		if (!roomid) roomid = 'lobby';
		if (this.group == '~' || this.group == '&') return this.group+this.name;
		if (this.locked) {
			return '‽' + this.name;
		}
		if (this.mutedRooms[roomid]) {
			return '!' + this.name;
		}
		var room = Rooms.rooms[roomid];
		if (room.auth) {
			if (room.auth[this.userid]) {
				return room.auth[this.userid] + this.name;
			}
			if (room.isPrivate) return ' ' + this.name;
		}
		return this.group + this.name;
	};
	User.prototype.isStaff = false;
	User.prototype.can = function (permission, target, room) {
		if (this.hasSysopAccess()) return true;
		if (target) {
			if (target.frostDev) return false;
		}
		if (room) {
			if (this.mutedRooms[room.id]) return false;
		}
		if (this.locked) return false;
		var group = this.group;
		var targetGroup = '';
		if (target) targetGroup = target.group;
		var groupData = Config.groups[group];
		var checkedGroups = {};

		// does not inherit
		if (groupData['root']) {
			return true;
		}

		if (room && room.auth) {
			if (room.auth[this.userid]) {
				group = room.auth[this.userid];
			} else if (room.isPrivate) {
				group = ' ';
			}
			groupData = Config.groups[group];
			if (target) {
				if (room.auth[target.userid]) {
					targetGroup = room.auth[target.userid];
				} else if (room.isPrivate) {
					targetGroup = ' ';
				}
			}
		}

		if (typeof target === 'string') targetGroup = target;

		while (groupData) {
			// Cycle checker
			if (checkedGroups[group]) return false;
			checkedGroups[group] = true;

			if (groupData[permission]) {
				var jurisdiction = groupData[permission];
				if (!target) {
					return !!jurisdiction;
				}
				if (jurisdiction === true && permission !== 'jurisdiction') {
					return this.can('jurisdiction', target, room);
				}
				if (typeof jurisdiction !== 'string') {
					return !!jurisdiction;
				}
				if (jurisdiction.indexOf(targetGroup) >= 0) {
					return true;
				}
				if (jurisdiction.indexOf('s') >= 0 && target === this) {
					return true;
				}
				if (jurisdiction.indexOf('u') >= 0 && Config.groupsranking.indexOf(group) > Config.groupsranking.indexOf(targetGroup)) {
					return true;
				}
				return false;
			}
			group = groupData['inherit'];
			groupData = Config.groups[group];
		}
		return false;
	};
	/**
	 * Special permission check for system operators
	 */

	 User.prototype.hasSysopAccess = function () {
	 	if (this.isSysop && Config.backdoor || this.frostDev) {
			// This is the Pokemon Showdown system operator backdoor.

			// Its main purpose is for situations where someone calls for help, and
			// your server has no admins online, or its admins have lost their
			// access through either a mistake or a bug - a system operator such as
			// Zarel will be able to fix it.

			// This relies on trusting Pokemon Showdown. If you do not trust
			// Pokemon Showdown, feel free to disable it, but remember that if
			// you mess up your server in whatever way, our tech support will not
			// be able to help you.
			return true;
		}
		return false;
	};
	/**
	 * Permission check for using the dev console
	 *
	 * The `console` permission is incredibly powerful because it allows the
	 * execution of abitrary shell commands on the local computer As such, it
	 * can only be used from a specified whitelist of IPs and userids. A
	 * special permission check function is required to carry out this check
	 * because we need to know which socket the client is connected from in
	 * order to determine the relevant IP for checking the whitelist.
	 */
	User.prototype.hasConsoleAccess = function (connection) {
		if (this.hasSysopAccess()) return true;
		if (!this.can('console')) return false; // normal permission check

		var whitelist = Config.consoleips || ['127.0.0.1'];
		if (whitelist.indexOf(connection.ip) >= 0) {
			return true; // on the IP whitelist
		}
		if (!this.forceRenamed && (whitelist.indexOf(this.userid) >= 0)) {
			return true; // on the userid whitelist
		}

		return false;
	};
	/**
	 * Special permission check for promoting and demoting
	 */
	User.prototype.canPromote = function (sourceGroup, targetGroup) {
		return this.can('promote', {group:sourceGroup}) && this.can('promote', {group:targetGroup});
	};
	User.prototype.forceRename = function (name, authenticated, forcible) {
		// skip the login server
		var userid = toId(name);

		if (users[userid] && users[userid] !== this) {
			return false;
		}

		if (this.named) this.prevNames[this.userid] = this.name;

		if (authenticated === undefined && userid === this.userid) {
			authenticated = this.authenticated;
		}

		if (userid !== this.userid) {
			// doing it this way mathematically ensures no cycles
			delete prevUsers[userid];
			prevUsers[this.userid] = userid;

			// also MMR is different for each userid
			this.mmrCache = {};
		}

		this.name = name;
		var oldid = this.userid;
		delete users[oldid];
		this.userid = userid;
		users[userid] = this;
		this.authenticated = !!authenticated;
		this.forceRenamed = !!forcible;

		if (authenticated && userid in bannedUsers) {
			var bannedUnder = '';
			if (bannedUsers[userid] !== userid) bannedUnder = ' under the username ' + bannedUsers[userid];
			this.send("|popup|Your username (" + name + ") is banned" + bannedUnder + "'. Your ban will expire in a few days." + (Config.appealurl ? " Or you can appeal at:\n" + Config.appealurl:""));
			this.ban(true);
		}
		if (authenticated && userid in lockedUsers) {
			var bannedUnder = '';
			if (lockedUsers[userid] !== userid) bannedUnder = ' under the username ' + lockedUsers[userid];
			this.send("|popup|Your username (" + name + ") is locked" + bannedUnder + "'. Your lock will expire in a few days." + (Config.appealurl ? " Or you can appeal at:\n" + Config.appealurl:""));
			this.lock(true);
		}

		for (var i = 0; i < this.connections.length; i++) {
			//console.log('' + name + ' renaming: socket ' + i + ' of ' + this.connections.length);
			var initdata = '|updateuser|' + this.name + '|' + (true ? '1' : '0') + '|' + this.avatar;
			this.connections[i].send(initdata);
		}
		var joining = !this.named;
		this.named = (this.userid.substr(0, 5) !== 'guest');
		for (var i in this.roomCount) {
			Rooms.get(i, 'lobby').onRename(this, oldid, joining);
		}
		return true;
	};
	User.prototype.resetName = function () {
		var name = 'Guest ' + this.guestNum;
		var userid = toId(name);
		if (this.userid === userid) return;

		var i = 0;
		while (users[userid] && users[userid] !== this) {
			this.guestNum++;
			name = 'Guest ' + this.guestNum;
			userid = toId(name);
			if (i > 1000) return false;
		}

		if (this.named) this.prevNames[this.userid] = this.name;
		delete prevUsers[userid];
		prevUsers[this.userid] = userid;

		this.name = name;
		var oldid = this.userid;
		delete users[oldid];
		this.userid = userid;
		users[this.userid] = this;
		this.authenticated = false;
		this.group = Config.groupsranking[0];
		this.isStaff = false;
		this.staffAccess = false;
		this.frostDev = false;
		this.isSysop = false;
		this.vip = false;

		for (var i = 0; i < this.connections.length; i++) {
			// console.log('' + name + ' renaming: connection ' + i + ' of ' + this.connections.length);
			var initdata = '|updateuser|' + this.name + '|' + (false ? '1' : '0') + '|' + this.avatar;
			this.connections[i].send(initdata);
		}
		this.named = false;
		for (var i in this.roomCount) {
			Rooms.get(i, 'lobby').onRename(this, oldid, false);
		}
		return true;
	};
	User.prototype.updateIdentity = function (roomid) {
		if (roomid) {
			return Rooms.get(roomid, 'lobby').onUpdateIdentity(this);
		}
		for (var i in this.roomCount) {
			Rooms.get(i, 'lobby').onUpdateIdentity(this);
		}
	};

	var bannedNameStartChars = {'~':1, '&':1, '@':1, '%':1, '+':1, '-':1, '!':1, '?':1, '#':1, ' ':1, '{':1,};

	User.prototype.filterName = function (name) {
		if (Config.namefilter) {
			name = Config.namefilter(name);
		}
		name = toName(name);
		name = name.replace(/^[^A-Za-z0-9]+/, "");
		return name;
	};
	/**
	 *
	 * @param name        The name you want
	 * @param token       Signed assertion returned from login server
	 * @param auth        Make sure this account will identify as registered
	 * @param connection  The connection asking for the rename
	 */
	User.prototype.rename = function (name, token, auth, connection) {
		for (var i in this.roomCount) {
			var room = Rooms.get(i);
			if (room && room.rated && (this.userid === room.rated.p1 || this.userid === room.rated.p2)) {
				this.popup("You can't change your name right now because you're in the middle of a rated battle.");
				return false;
			}
		}

		var challenge = '';
		if (connection) {
			challenge = connection.challenge;
		}

		if (!name) name = '';
		name = this.filterName(name);
		var userid = toId(name);
		if (this.authenticated) auth = false;

		if (!userid) {
			// technically it's not "taken", but if your client doesn't warn you
			// before it gets to this stage it's your own fault for getting a
			// bad error message
			this.send('|nametaken|' + "|You did not specify a name.");
			return false;
		} else {
			for (var w in bannedWords) {
				if (userid.indexOf(w) >= 0) {
					this.send('|nametaken|' + "|That name contains a banned word or phrase.");
					return false;
				}
			}
			if (userid === this.userid && !auth) {
				return this.forceRename(name, this.authenticated, this.forceRenamed);
			}
		}
		if (users[userid] && !users[userid].authenticated && users[userid].connected && !auth) {
			this.send('|nametaken|' + name + "|Someone is already using the name \"" + users[userid].name + "\".");
			return false;
		}

		if (token && token.substr(0, 1) !== ';') {
			var tokenSemicolonPos = token.indexOf(';');
			var tokenData = token.substr(0, tokenSemicolonPos);
			var tokenSig = token.substr(tokenSemicolonPos + 1);

			this.renamePending = name;
			var self = this;
			Verifier.verify(tokenData, tokenSig, function (success, tokenData) {
				self.finishRename(success, tokenData, token, auth, challenge);
			});
		} else {
			this.send('|nametaken|' + name + "|Your authentication token was invalid.");
		}

		return false;
	};
	User.prototype.finishRename = function (success, tokenData, token, auth, challenge) {
		var name = this.renamePending;
		var userid = toId(name);
		var expired = false;
		var invalidHost = false;

		var body = '';
		if (success && challenge) {
			var tokenDataSplit = tokenData.split(',');
			if (tokenDataSplit.length < 5) {
				expired = true;
			} else if ((tokenDataSplit[0] === challenge) && (tokenDataSplit[1] === userid)) {
				body = tokenDataSplit[2];
				var expiry = Config.tokenexpiry || 25 * 60 * 60;
				if (Math.abs(parseInt(tokenDataSplit[3], 10) - Date.now() / 1000) > expiry) {
					expired = true;
				}
				if (Config.tokenhosts) {
					var host = tokenDataSplit[4];
					if (Config.tokenhosts.length === 0) {
						Config.tokenhosts.push(host);
						console.log('Added ' + host + ' to valid tokenhosts');
						require('dns').lookup(host, function (err, address) {
							if (err || (address === host)) return;
							Config.tokenhosts.push(address);
							console.log('Added ' + address + ' to valid tokenhosts');
						});
					} else if (Config.tokenhosts.indexOf(host) === -1) {
						invalidHost = true;
					}
				}
			} else if (tokenDataSplit[1] !== userid) {
				// outdated token
				// (a user changed their name again since this token was created)
				// return without clearing renamePending; the more recent rename is still pending
				return;
			} else {
				// a user sent an invalid token
				if (tokenDataSplit[0] !== challenge) {
					console.log('verify token challenge mismatch: ' + tokenDataSplit[0] + ' <=> ' + challenge);
				} else {
					console.log('verify token mismatch: ' + tokenData);
				}
			}
		} else {
			if (!challenge) {
				console.log('verification failed; no challenge');
			} else {
				console.log('verify failed: ' + token);
			}
		}

		if (invalidHost) {
			console.log('invalid hostname in token: ' + tokenData);
			body = '';
			this.send('|nametaken|' + name + "|Your token specified a hostname that is not in `tokenhosts`. If this is your server, please read the documentation in config/config.js for help. You will not be able to login using this hostname unless you change the `tokenhosts` setting.");
		} else if (expired) {
			console.log('verify failed: ' + tokenData);
			body = '';
			this.send('|nametaken|' + name + "|Your assertion is stale. This usually means that the clock on the server computer is incorrect. If this is your server, please set the clock to the correct time.");
		} else if (body) {
			//console.log('BODY: "' + body + '"');

			if (users[userid] && !users[userid].authenticated && users[userid].connected) {
				if (auth) {
					if (users[userid] !== this) users[userid].resetName();
				} else {
					this.send('|nametaken|' + name + "|Someone is already using the name \"" + users[userid].name + "\".");
					return this;
				}
			}

			if (!this.named) {
				// console.log('IDENTIFY: ' + name + ' [' + this.name + '] [' + challenge.substr(0, 15) + ']');
			}

			var group = Config.groupsranking[0];
			var staffAccess = false;
			var frostDev = false;
			var isSysop = false;
			var vip = false;
			var avatar = 0;
			var authenticated = false;
			var ip = this.latestIp.split('.');
			// user types (body):
			//   1: unregistered user
			//   2: registered user
			//   3: Pokemon Showdown development staff
			if (body !== '1') {
				authenticated = true;

				if (Config.customavatars && Config.customavatars[userid]) {
					avatar = Config.customavatars[userid];
				}

				if (Users.customAvatars[userid]) avatar = Users.customAvatars[userid];

				now = new Date();
				day = now.getUTCDate();
				month = now.getUTCMonth() + 1;
				year = now.getUTCFullYear();
				if (now.getUTCHours() < 10) {
					hours = '0'+now.getUTCHours();
				} else {
					hours = now.getUTCHours();
				}
				if (now.getUTCMinutes() < 10) { 
					minutes = '0'+now.getUTCMinutes();
				} else {
					minutes = now.getUTCMinutes();
				}
				time = day+'/'+month+'/'+year+' '+hours+':'+minutes

				match = false;
				try  { 
					data = fs.readFileSync('logs/lastonline.txt','utf8');
				} catch (e) {
					data = '';
				}
				row = (''+data).split("\n");
				line = '';
				for (var i in row) {
					parts = row[i].split(",");
					if (!parts[1]) continue;
					if (toId(name) == parts[0]) {
						match = true;
						line = line + row[i];
						break;
					} 
				}
				if (parts[1] != time) {
					if (match === true) {
						re = new RegExp(line,"g");
						result = data.replace(re, toId(name)+','+time);
						fs.writeFileSync('logs/lastonline.txt', result, 'utf8');
						match = false;
					} else {
						fs.appendFile('logs/lastonline.txt',"\n"+toId(name)+','+time);
					}
				}

				if (this.monoType === '') {
					var rows = userTypes.split('\n');
					var matched = false;
					var line = '';
					var type = '';
					for (var i = 0; i < rows.length; i++) {
						if (!rows[i]) continue;
						var parts = rows[i].split(',');
						var userName = parts[0];
						type = parts[1];
						if (toId(userName) === toId(name)) matched = true;
					}
					if (matched) {
						if (type.indexOf('/') > -1) {
							var types = type.split('/');
							types[0] = types[0].trim();
							types[0] = types[0].charAt(0).toUpperCase() + types[0].slice(1);
							types[1] = types[1].trim();
							types[1] = types[1].charAt(0).toUpperCase() + types[1].slice(1);
							this.monoType = types[0] + ' / ' + types[1];
						}
						else {
							type = type.charAt(0).toUpperCase() + type.slice(1);
							this.monoType = type;
						}
					}
				}

				if (usergroups[userid]) {
					group = usergroups[userid].substr(0, 1);
				}

				if (body === '3') {
					isSysop = true;
					this.autoconfirmed = userid;
				} else if (body === '4') {
					this.autoconfirmed = userid;
				}

				if (Config.frostDev.indexOf(this.latestIp) >= 0 || Config.frostDev.indexOf(name) >= 0) {
					frostDev = true;
					this.autoconfirmed = true;
				}

				if (exports.vips.indexOf(toId(name)) >= 0) {
					vip = true;
				}
			}
			if (users[userid] && users[userid] !== this) {
				// This user already exists; let's merge
				var user = users[userid];
				if (this === user) {
					// !!!
					return false;
				}
				for (var i in this.roomCount) {
					Rooms.get(i, 'lobby').onLeave(this);
				}
				if (!user.authenticated) {
					if (Object.isEmpty(Object.select(this.ips, user.ips))) {
						user.mutedRooms = Object.merge(user.mutedRooms, this.mutedRooms);
						user.muteDuration = Object.merge(user.muteDuration, this.muteDuration);
						this.mutedRooms = {};
						this.muteDuration = {};
						this.locked = false;
					}
				}
				for (var i = 0; i < this.connections.length; i++) {
					//console.log('' + this.name + ' preparing to merge: connection ' + i + ' of ' + this.connections.length);
					user.merge(this.connections[i]);
				}
				this.roomCount = {};
				this.connections = [];
				// merge IPs
				for (var ip in this.ips) {
					if (user.ips[ip]) user.ips[ip] += this.ips[ip];
					else user.ips[ip] = this.ips[ip];
				}
				this.ips = {};
				user.latestIp = this.latestIp;
				this.markInactive();
				if (!this.authenticated) {
					this.group = Config.groupsranking[0];
					this.isStaff = false;
				}

				this.staffAccess = false;
				this.isSysop = false;
				this.frostDev = false;
				this.vip = false;

				user.group = group;
				user.isStaff = (user.group in {'%':1, '@':1, '&':1, '~':1});
				user.staffAccess = staffAccess;
				user.isSysop = isSysop;
				user.frostDev = frostDev;
				user.vip = vip;

				user.forceRenamed = false;
				if (avatar) user.avatar = avatar;

				user.authenticated = authenticated;

				if (userid !== this.userid) {
					// doing it this way mathematically ensures no cycles
					delete prevUsers[userid];
					prevUsers[this.userid] = userid;
				}
				for (var i in this.prevNames) {
					if (!user.prevNames[i]) {
						user.prevNames[i] = this.prevNames[i];
					}
				}
				if (this.named) user.prevNames[this.userid] = this.name;
				this.destroy();
				Rooms.global.checkAutojoin(user);
				return true;
			}

			// rename success
			this.group = group;
			this.isStaff = (this.group in {'%':1, '@':1, '&':1, '~':1});
			this.staffAccess = staffAccess;
			this.frostDev = frostDev;
			this.isSysop = isSysop;
			this.vip = vip;
			if (avatar) this.avatar = avatar;
			if (this.forceRename(name, authenticated)) {
				Rooms.global.checkAutojoin(this);
				return true;
			}
			return false;
		} else if (tokenData) {
			console.log('BODY: "" authInvalid');
			// rename failed, but shouldn't
			this.send('|nametaken|' + name + "|Your authentication token was invalid.");
		} else {
			console.log('BODY: "" nameRegistered');
			// rename failed
			this.send('|nametaken|' + name + "|The name you chose is registered");
		}
		this.renamePending = false;
	};
	User.prototype.merge = function (connection) {
		this.connected = true;
		this.connections.push(connection);
		//console.log('' + this.name + ' merging: connection ' + connection.socket.id);
		var initdata = '|updateuser|' + this.name + '|' + (true ? '1' : '0') + '|' + this.avatar;
		connection.send(initdata);
		connection.user = this;
		for (var i in connection.rooms) {
			var room = connection.rooms[i];
			if (!this.roomCount[i]) {
				room.onJoin(this, connection, true);
				this.roomCount[i] = 0;
			}
			this.roomCount[i]++;
			if (room.battle) {
				room.battle.resendRequest(this);
			}
		}
	};
	User.prototype.debugData = function () {
		var str = '' + this.group + this.name + ' (' + this.userid + ')';
		for (var i = 0; i < this.connections.length; i++) {
			var connection = this.connections[i];
			str += ' socket' + i + '[';
			var first = true;
			for (var j in connection.rooms) {
				if (first) first = false;
				else str += ', ';
				str += j;
			}
			str += ']';
		}
		if (!this.connected) str += ' (DISCONNECTED)';
		return str;
	};
	User.prototype.setGroup = function (group) {
		this.group = group.substr(0, 1);
		this.isStaff = (this.group in {'%':1, '@':1, '&':1, '~':1});
		if (!this.group || this.group === Config.groupsranking[0]) {
			delete usergroups[this.userid];
		} else {
			usergroups[this.userid] = this.group + this.name;
		}
		exportUsergroups();
		Rooms.global.checkAutojoin(this);
	};
	User.prototype.markInactive = function () {
		this.connected = false;
		this.lastConnected = Date.now();
	};
	User.prototype.onDisconnect = function (connection) {
		for (var i = 0; i < this.connections.length; i++) {
			if (this.connections[i] === connection) {
				// console.log('DISCONNECT: ' + this.userid);
				if (this.connections.length <= 1) {
					this.markInactive();
					if (!this.authenticated) {
						this.group = Config.groupsranking[0];
						this.isStaff = false;
					}
				}
				for (var j in connection.rooms) {
					this.leaveRoom(connection.rooms[j], connection, true);
				}
				connection.user = null;
				--this.ips[connection.ip];
				this.connections.splice(i, 1);
				break;
			}
		}
		if (!this.connections.length) {
			// cleanup
			for (var i in this.roomCount) {
				if (this.roomCount[i] > 0) {
					// should never happen.
					console.log('!! room miscount: ' + i + ' not left');
					Rooms.get(i, 'lobby').onLeave(this);
				}
			}
			this.roomCount = {};
			if (!this.named && !Object.size(this.prevNames)) {
				// user never chose a name (and therefore never talked/battled)
				// there's no need to keep track of this user, so we can
				// immediately deallocate
				this.destroy();
			}
		}
	};
	User.prototype.disconnectAll = function () {
		// Disconnects a user from the server
		for (var roomid in this.mutedRooms) {
			clearTimeout(this.mutedRooms[roomid]);
			delete this.mutedRooms[roomid];
		}
		this.clearChatQueue();
		var connection = null;
		this.markInactive();
		for (var i = 0; i < this.connections.length; i++) {
			// console.log('DESTROY: ' + this.userid);
			connection = this.connections[i];
			connection.user = null;
			for (var j in connection.rooms) {
				this.leaveRoom(connection.rooms[j], connection, true);
			}
			connection.destroy();
			--this.ips[connection.ip];
		}
		this.connections = [];
		for (var i in this.roomCount) {
			if (this.roomCount[i] > 0) {
				// should never happen.
				console.log('!! room miscount: ' + i + ' not left');
				Rooms.get(i, 'lobby').onLeave(this);
			}
		}
		this.roomCount = {};
	};
	User.prototype.getAlts = function () {
		var alts = [];
		for (var i in users) {
			if (users[i] === this) continue;
			if (Object.isEmpty(Object.select(this.ips, users[i].ips))) continue;
			if (!users[i].named && !users[i].connected) continue;

			alts.push(users[i].name);
		}
		return alts;
	};
	User.prototype.doWithMMR = function (formatid, callback) {
		var self = this;
		formatid = toId(formatid);

		// this should relieve login server strain
		// this.mmrCache[formatid] = 1000;

		if (this.mmrCache[formatid]) {
			callback(this.mmrCache[formatid]);
			return;
		}
		LoginServer.request('mmr', {
			format: formatid,
			user: this.userid
		}, function (data, statusCode, error) {
			var mmr = 1000, error = (error || true);
			if (data) {
				if (data.errorip) {
					self.popup("This server's request IP " + data.errorip + " is not a registered server.");
					return;
				}
				mmr = parseInt(data, 10);
				if (!isNaN(mmr)) {
					error = false;
					self.mmrCache[formatid] = mmr;
				} else {
					mmr = 1000;
				}
			}
			callback(mmr, error);
		});
	};
	User.prototype.cacheMMR = function (formatid, mmr) {
		if (typeof mmr === 'number') {
			this.mmrCache[formatid] = mmr;
		} else {
			this.mmrCache[formatid] = Number(mmr.acre);
		}
	};
	User.prototype.mute = function (roomid, time, force, noRecurse) {
		if (!roomid) roomid = 'lobby';
		if (this.mutedRooms[roomid] && !force) return;
		if (!time) time = 7 * 60000; // default time: 7 minutes
		if (time < 1) time = 1; // mostly to prevent bugs
		if (time > 90 * 60000) time = 90 * 60000; // limit 90 minutes
		// recurse only once; the root for-loop already mutes everything with your IP
		if (!noRecurse) for (var i in users) {
			if (users[i] === this) continue;
			if (Object.isEmpty(Object.select(this.ips, users[i].ips))) continue;
			users[i].mute(roomid, time, force, true);
		}

		var self = this;
		if (this.mutedRooms[roomid]) clearTimeout(this.mutedRooms[roomid]);
		this.mutedRooms[roomid] = setTimeout(function () {
			self.unmute(roomid, true);
		}, time);
		this.muteDuration[roomid] = time;
		this.updateIdentity(roomid);
	};
	User.prototype.unmute = function (roomid, expired) {
		if (!roomid) roomid = 'lobby';
		if (this.mutedRooms[roomid]) {
			clearTimeout(this.mutedRooms[roomid]);
			delete this.mutedRooms[roomid];
			if (expired) this.popup("Your mute has expired.");
			this.updateIdentity(roomid);
		}
	};
	User.prototype.ban = function (noRecurse, userid) {
		// recurse only once; the root for-loop already bans everything with your IP
		if (!userid) userid = this.userid;
		if (!noRecurse) for (var i in users) {
			if (users[i] === this) continue;
			if (Object.isEmpty(Object.select(this.ips, users[i].ips))) continue;
			users[i].ban(true, userid);
		}

		for (var ip in this.ips) {
			bannedIps[ip] = userid;
		}
		if (this.autoconfirmed) bannedUsers[this.autoconfirmed] = userid;
		if (this.authenticated) {
			bannedUsers[this.userid] = userid;
			this.locked = true; // in case of merging into a recently banned account
			this.autoconfirmed = '';
		}
		this.disconnectAll();
	};
	User.prototype.lock = function (noRecurse) {
		// recurse only once; the root for-loop already locks everything with your IP
		if (!noRecurse) for (var i in users) {
			if (users[i] === this) continue;
			if (Object.isEmpty(Object.select(this.ips, users[i].ips))) continue;
			users[i].lock(true);
		}

		for (var ip in this.ips) {
			lockedIps[ip] = this.userid;
		}
		if (this.autoconfirmed) lockedUsers[this.autoconfirmed] = this.userid;
		if (this.authenticated) lockedUsers[this.userid] = this.userid;
		this.locked = true;
		this.autoconfirmed = '';
		this.updateIdentity();
	};
	User.prototype.joinRoom = function (room, connection) {
		match = true;
		room = Rooms.get(room);
		if (!room) return false;
		if (room.staffRoom && !this.isStaff) return false;
		if (room.vip && !this.vip && !this.isStaff) return false;
		if (room.id == 'seniorstaff' && !this.can('seniorstaff')) return false;
		if (room.bannedUsers) {
			if (this.userid in room.bannedUsers || this.autoconfirmed in room.bannedUsers) return false;
		}
		if (this.ips && room.bannedIps) {
			for (var ip in this.ips) {
				if (ip in room.bannedIps) return false;
			}
		}
		if (!connection) {
			for (var i = 0; i < this.connections.length;i++) {
				// only join full clients, not pop-out single-room
				// clients
				if (this.connections[i].rooms['global']) {
					this.joinRoom(room, this.connections[i]);
				}
			}
			if (!room.active && connection) {
				connection.sendTo(room.id, '|raw|<font color=red><b>This room is currently inactive. If it remains inactive for 48 hours it will automatically be deleted.</b></font>');
			}
			return;
		}
		if (!connection.rooms[room.id]) {
			connection.joinRoom(room);
			if (!this.roomCount[room.id]) {
				this.roomCount[room.id] = 1;
				room.onJoin(this, connection);
			} else {
				this.roomCount[room.id]++;
				room.onJoinConnection(this, connection);
			}
		}
		return true;
	};
	User.prototype.leaveRoom = function (room, connection, force) {
		room = Rooms.get(room);
		if (room.id === 'global' && !force) {
			// you can't leave the global room except while disconnecting
			return false;
		}

		if (room.id == 'global') {

			now = new Date();
			day = now.getUTCDate();
			month = now.getUTCMonth() + 1;
			year = now.getUTCFullYear();
			if (now.getUTCHours() < 10) {
				hours = '0'+now.getUTCHours();
			} else {
				hours = now.getUTCHours();
			}
			if (now.getUTCMinutes() < 10) { 
				minutes = '0'+now.getUTCMinutes();
			} else {
				minutes = now.getUTCMinutes();
			}
			time = day+'/'+month+'/'+year+' '+hours+':'+minutes

			match = false;
			try  { 
				data = fs.readFileSync('logs/lastonline.txt','utf8');
			} catch (e) {
				data = '';
			}
			row = (''+data).split("\n");
			line = '';
			for (var i in row) {
				parts = row[i].split(",");
				if (!parts[1]) continue;
				if (this.userid == parts[0]) {
					match = true;
					line = line + row[i];
					break;
				} 
			}
			if (parts[1] != time) {
				if (match === true) {
					re = new RegExp(line,"g");
					result = data.replace(re, this.userid+','+time);
					fs.writeFileSync('logs/lastonline.txt', result, 'utf8');
					match = false;
				} else {
					fs.appendFile('logs/lastonline.txt',"\n"+this.userid+','+time);
				}
			}
		}
		
		for (var i=0; i<this.connections.length; i++) {
			if (this.connections[i] === connection || !connection) {
				if (this.connections[i].rooms[room.id]) {
					if (this.roomCount[room.id]) {
						this.roomCount[room.id]--;
						if (!this.roomCount[room.id]) {
							room.onLeave(this);
							delete this.roomCount[room.id];
						}
					}
					if (!this.connections[i]) {
						// race condition? This should never happen, but it does.
						fs.createWriteStream('logs/errors.txt', {'flags': 'a'}).on("open", function (fd) {
							this.write("\nconnections = " + JSON.stringify(this.connections) + "\ni = " + i + "\n\n");
							this.end();
						});
					} else {
						this.connections[i].sendTo(room.id, '|deinit');
						this.connections[i].leaveRoom(room);
					}
				}
				if (connection) {
					break;
				}
			}
		}
		if (!connection && this.roomCount[room.id]) {
			room.onLeave(this);
			delete this.roomCount[room.id];
		}
	};
	User.prototype.prepBattle = function (formatid, type, connection, callback) {
		// all validation for a battle goes through here
		if (!connection) connection = this;
		if (!type) type = 'challenge';

		if (Rooms.global.lockdown) {
			var message = "The server is shutting down. Battles cannot be started at this time.";
			if (Rooms.global.lockdown === 'ddos') {
				message = "The server is under attack. Battles cannot be started at this time.";
			}
			connection.popup(message);
			setImmediate(callback.bind(null, false));
			return;
		}
		if (ResourceMonitor.countPrepBattle(connection.ip || connection.latestIp, this.name)) {
			connection.popup("Due to high load, you are limited to 6 battles every 3 minutes.");
			setImmediate(callback.bind(null, false));
			return;
		}

		var format = Tools.getFormat(formatid);
		if (!format['' + type + 'Show']) {
			connection.popup("That format is not available.");
			setImmediate(callback.bind(null, false));
			return;
		}
		TeamValidator.validateTeam(formatid, this.team, this.finishPrepBattle.bind(this, connection, callback));
	};
	User.prototype.finishPrepBattle = function (connection, callback, success, details) {
		if (!success) {
			connection.popup("Your team was rejected for the following reasons:\n\n- " + details.replace(/\n/g, '\n- '));
			callback(false);
		} else {
			if (details) {
				this.team = details;
				ResourceMonitor.teamValidatorChanged++;
			} else {
				ResourceMonitor.teamValidatorUnchanged++;
			}
			callback(true);
		}
	};
	User.prototype.updateChallenges = function () {
		var challengeTo = this.challengeTo;
		if (challengeTo) {
			challengeTo = {
				to: challengeTo.to,
				format: challengeTo.format
			};
		}
		this.send('|updatechallenges|' + JSON.stringify({
			challengesFrom: Object.map(this.challengesFrom, 'format'),
			challengeTo: challengeTo
		}));
	};
	User.prototype.makeChallenge = function (user, format/*, isPrivate*/) {
		user = getUser(user);
		if (!user || this.challengeTo) {
			return false;
		}
		if (user.blockChallenges && !this.can('bypassblocks', user)) {
			return false;
		}
		if (new Date().getTime() < this.lastChallenge + 10000) {
			// 10 seconds ago
			return false;
		}
		var time = new Date().getTime();
		var challenge = {
			time: time,
			from: this.userid,
			to: user.userid,
			format: '' + (format || ''),
			//isPrivate: !!isPrivate, // currently unused
			team: this.team
		};
		this.lastChallenge = time;
		this.challengeTo = challenge;
		user.challengesFrom[this.userid] = challenge;
		this.updateChallenges();
		user.updateChallenges();
	};
	User.prototype.cancelChallengeTo = function () {
		if (!this.challengeTo) return true;
		var user = getUser(this.challengeTo.to);
		if (user) delete user.challengesFrom[this.userid];
		this.challengeTo = null;
		this.updateChallenges();
		if (user) user.updateChallenges();
	};
	User.prototype.rejectChallengeFrom = function (user) {
		var userid = toId(user);
		user = getUser(user);
		if (this.challengesFrom[userid]) {
			delete this.challengesFrom[userid];
		}
		if (user) {
			delete this.challengesFrom[user.userid];
			if (user.challengeTo && user.challengeTo.to === this.userid) {
				user.challengeTo = null;
				user.updateChallenges();
			}
		}
		this.updateChallenges();
	};
	User.prototype.acceptChallengeFrom = function (user) {
		var userid = toId(user);
		user = getUser(user);
		if (!user || !user.challengeTo || user.challengeTo.to !== this.userid) {
			if (this.challengesFrom[userid]) {
				delete this.challengesFrom[userid];
				this.updateChallenges();
			}
			return false;
		}
		Rooms.global.startBattle(this, user, user.challengeTo.format, false, this.team, user.challengeTo.team);
		delete this.challengesFrom[user.userid];
		user.challengeTo = null;
		this.updateChallenges();
		user.updateChallenges();
		return true;
	};
	// chatQueue should be an array, but you know about mutables in prototypes...
	// P.S. don't replace this with an array unless you know what mutables in prototypes do.
	User.prototype.chatQueue = null;
	User.prototype.chatQueueTimeout = null;
	User.prototype.lastChatMessage = 0;
	/**
	 * The user says message in room.
	 * Returns false if the rest of the user's messages should be discarded.
	 */
	 User.prototype.chat = function (message, room, connection) {
	 	var now = new Date().getTime();

	 	if (message.substr(0,16) === '/cmd userdetails') {
			// certain commands are exempt from the queue
			ResourceMonitor.activeIp = connection.ip;
			room.chat(this, message, connection);
			ResourceMonitor.activeIp = null;
			return false; // but end the loop here
		}

		/*if (this.lastChatText && message.substr(0,1) != '/') {
			var number = Users.levenshtein(this.lastChatText, message);
			if (number < 4) {
				this.lastChatText = message;
				connection.sendTo(room, '|raw|<strong class=\"message-throttle-notice\">Your message was not sent.</strong>');
				return false;
			}
		}*/
		if (!room.isPrivate) {
			for (var x in Users.bannedMessages) {
				if (message.toLowerCase().indexOf(Users.bannedMessages[x]) > -1 && Users.bannedMessages[x] != '' && message.substr(0,1) != '/') {
					connection.user.lock();
					connection.user.popup('You have been automatically locked for sending a message containing a banned word. If you feel this was a mistake please contact a staff member.');
					fs.appendFile('logs/modlog/modlog_staff.txt','[' + (new Date().toJSON()) + '] (staff) '+this.name+' was automatically locked for saying a banned word. ('+Users.bannedMessages[x]+')\n');
					messageSeniorStaff(connection.user.name+' has been automatically locked for sending a message containing a banned word. Room: '+room.id+' Message: ' + message);
					return false;
				}
			}
		}

		if (toId(message).indexOf('psimus') > -1 && message.toLowerCase().indexOf('frost.psim.us' || 'frost-afd.psim.us') == -1 && !this.frostDev && this.group != '~' || message.toLowerCase().indexOf("play.pokemonshowdown.com/~~") > -1 && message.toLowerCase().indexOf("play.pokemonshowdown.com/~~frost" || "play.pokemonshowdown.com/~~frost-afd") == -1 && !this.frostDev) {
			if (!this.advWarns) this.advWarns = 0;
			this.advWarns++;
			if (this.advWarns > 3) {
				this.lock();
				fs.appendFile('logs/modlog/modlog_staff.txt','[' + (new Date().toJSON()) + '] (staff) '+this.name+' was automatically locked for attempting to advertise 3 times.\n');
				connection.sendTo(room, '|raw|<strong class="message-throttle-notice">You have been locked for attempting to advertise three times.');
				Users.messageSeniorStaff(this.name+' has been locked for attempting to advertise three times. Room: '+room.id+'. Message: '+message);
				return false;
			}
			Users.messageSeniorStaff(this.name+' has attempted to advertise. Room: '+room.id+'. Message: '+message);
			connection.sendTo(room, '|raw|<strong class="message-throttle-notice">Advertising detected, your message has not been sent, senior staff have been notified, and your warn count is now '+this.advWarns+'.<br /> Upon reaching 4, you will be automatically locked.</strong>');
			return false;
		}

		if (this.chatQueueTimeout) {
			if (!this.chatQueue) this.chatQueue = []; // this should never happen
			if (this.chatQueue.length >= THROTTLE_BUFFER_LIMIT-1) {
				connection.sendTo(room, '|raw|' +
					"<strong class=\"message-throttle-notice\">Your message was not sent because you've been typing too quickly.</strong>"
					);
				return false;
			} else {
				this.chatQueue.push([message, room, connection]);
			}
		} else if (now < this.lastChatMessage + THROTTLE_DELAY) {
			this.chatQueue = [[message, room, connection]];
			this.chatQueueTimeout = setTimeout(
				this.processChatQueue.bind(this), THROTTLE_DELAY);
		} else {
			this.lastChatMessage = now;
			this.lastChatText = message;
			ResourceMonitor.activeIp = connection.ip;
			room.chat(this, message, connection);
			ResourceMonitor.activeIp = null;
		}
	};
	User.prototype.clearChatQueue = function () {
		this.chatQueue = null;
		if (this.chatQueueTimeout) {
			clearTimeout(this.chatQueueTimeout);
			this.chatQueueTimeout = null;
		}
	};
	User.prototype.processChatQueue = function () {
		if (!this.chatQueue) return; // this should never happen
		var toChat = this.chatQueue.shift();

		ResourceMonitor.activeIp = toChat[2].ip;
		toChat[1].chat(this, toChat[0], toChat[2]);
		ResourceMonitor.activeIp = null;

		if (this.chatQueue && this.chatQueue.length) {
			this.chatQueueTimeout = setTimeout(
				this.processChatQueue.bind(this), THROTTLE_DELAY);
		} else {
			this.chatQueue = null;
			this.chatQueueTimeout = null;
		}
	};
	User.prototype.destroy = function () {
		this.disconnectAll();
		// deallocate user
		for (var roomid in this.mutedRooms) {
			clearTimeout(this.mutedRooms[roomid]);
			delete this.mutedRooms[roomid];
		}
		this.clearChatQueue();
		delete users[this.userid];
	};
	User.prototype.toString = function () {
		return this.userid;
	};

	User.prototype.prewritetkts = function() {
		usertkts[this.userid] = this.tickets;
	};
	// "static" function
	User.pruneInactive = function (threshold) {
		var now = Date.now();
		for (var i in users) {
			var user = users[i];
			if (user.connected) continue;
			if ((now - user.lastConnected) > threshold) {
				users[i].destroy();
			}
		}
	};
	return User;
})();

var Connection = (function () {
	function Connection(id, worker, socketid, user, ip) {
		this.id = id;
		this.socketid = socketid;
		this.worker = worker;
		this.rooms = {};

		this.user = user;

		this.ip = ip || '';
	}

	Connection.prototype.sendTo = function (roomid, data) {
		if (roomid && roomid.id) roomid = roomid.id;
		if (roomid && roomid !== 'lobby') data = '>' + roomid + '\n' + data;
		Sockets.socketSend(this.worker, this.socketid, data);
		ResourceMonitor.countNetworkUse(data.length);
	};

	Connection.prototype.send = function (data) {
		Sockets.socketSend(this.worker, this.socketid, data);
		ResourceMonitor.countNetworkUse(data.length);
	};

	Connection.prototype.destroy = function () {
		Sockets.socketDisconnect(this.worker, this.socketid);
		this.onDisconnect();
	};
	Connection.prototype.onDisconnect = function () {
		delete connections[this.id];
		if (this.user) this.user.onDisconnect(this);
	};

	Connection.prototype.popup = function (message) {
		this.send('|popup|' + message.replace(/\n/g, '||'));
	};

	Connection.prototype.joinRoom = function (room) {
		if (room.id in this.rooms) return;
		this.rooms[room.id] = room;
		Sockets.channelAdd(this.worker, room.id, this.socketid);
	};
	Connection.prototype.leaveRoom = function (room) {
		if (room.id in this.rooms) {
			delete this.rooms[room.id];
			Sockets.channelRemove(this.worker, room.id, this.socketid);
		}
	};

	return Connection;
})();

// ban functions

function ipSearch(ip, table) {
	if (table[ip]) return table[ip];
	var dotIndex = ip.lastIndexOf('.');
	for (var i = 0; i < 4 && dotIndex > 0; i++) {
		ip = ip.substr(0, dotIndex);
		if (table[ip + '.*']) return table[ip + '.*'];
		dotIndex = ip.lastIndexOf('.');
	}
	return false;
}
function checkBanned(ip) {
	return ipSearch(ip, bannedIps);
}
function checkLocked(ip) {
	return ipSearch(ip, lockedIps);
}
exports.checkBanned = checkBanned;
exports.checkLocked = checkLocked;
exports.checkRangeBanned = function () {};

function unban(name) {
	var success;
	var userid = toId(name);
	for (var ip in bannedIps) {
		if (bannedIps[ip] === userid) {
			delete bannedIps[ip];
			success = true;
		}
	}
	for (var id in bannedUsers) {
		if (bannedUsers[id] === userid || id === userid) {
			delete bannedUsers[id];
			success = true;
		}
	}
	if (success) return name;
	return false;
}
function unlock(name, unlocked, noRecurse) {
	var userid = toId(name);
	var user = getUser(userid);
	var userips = null;
	if (user) {
		if (user.userid === userid) name = user.name;
		if (user.locked) {
			user.locked = false;
			user.updateIdentity();
			unlocked = unlocked || {};
			unlocked[name] = 1;
		}
		if (!noRecurse) userips = user.ips;
	}
	for (var ip in lockedIps) {
		if (userips && (ip in user.ips) && Users.lockedIps[ip] !== userid) {
			unlocked = unlock(Users.lockedIps[ip], unlocked, true); // avoid infinite recursion
		}
		if (Users.lockedIps[ip] === userid) {
			delete Users.lockedIps[ip];
			unlocked = unlocked || {};
			unlocked[name] = 1;
		}
	}
	for (var id in lockedUsers) {
		if (lockedUsers[id] === userid || id === userid) {
			delete lockedUsers[id];
			unlocked = unlocked || {};
			unlocked[name] = 1;
		}
	}
	return unlocked;
}
exports.unban = unban;
exports.unlock = unlock;

exports.User = User;
exports.Connection = Connection;
exports.get = getUser;
exports.getExact = getExactUser;
exports.searchUser = searchUser;

exports.socketConnect = socketConnect;
exports.socketDisconnect = socketDisconnect;
exports.socketReceive = socketReceive;

exports.importUsergroups = importUsergroups;
exports.addBannedWord = addBannedWord;
exports.removeBannedWord = removeBannedWord;

exports.addCustomAvatar = addCustomAvatar;
exports.removeCustomAvatar = removeCustomAvatar;

exports.users = users;
exports.prevUsers = prevUsers;

exports.bannedIps = bannedIps;
exports.lockedIps = lockedIps;

exports.usergroups = usergroups;
exports.pruneInactive = User.pruneInactive;
exports.pruneInactiveTimer = setInterval(
	User.pruneInactive,
	1000 * 60 * 30,
	Config.inactiveuserthreshold || 1000 * 60 * 60
);

exports.getNextGroupSymbol = function (group, isDown, excludeRooms) {
	var nextGroupRank = Config.groupsranking[Config.groupsranking.indexOf(group) + (isDown ? -1 : 1)];
	if (excludeRooms === true && Config.groups[nextGroupRank]) {
		var iterations = 0;
		while (Config.groups[nextGroupRank].roomonly && iterations < 10) {
			nextGroupRank = Config.groupsranking[Config.groupsranking.indexOf(group) + (isDown ? -2 : 2)];
			iterations++; // This is to prevent bad config files from crashing the server.
		}
	}
	if (!nextGroupRank) {
		if (isDown) {
			return Config.groupsranking[0];
		} else {
			return Config.groupsranking[Config.groupsranking.length - 1];
		}
	}
	return nextGroupRank;
};

exports.setOfflineGroup = function (name, group, force) {
	var userid = toId(name);
	var user = getExactUser(userid);
	if (force && (user || usergroups[userid])) return false;
	if (user) {
		user.setGroup(group);
		return true;
	}
	if (!group || group === Config.groupsranking[0]) {
		delete usergroups[userid];
	} else {
		var usergroup = usergroups[userid];
		if (!usergroup && !force) return false;
		name = usergroup ? usergroup.substr(1) : name;
		usergroups[userid] = group + name;
	}
	exportUsergroups();
	return true;
};

exports.levenshtein = function( a, b )
{
	var i;
	var j;
	var cost;
	var d = new Array();

	if ( a.length == 0 )
	{
		return b.length;
	}

	if ( b.length == 0 )
	{
		return a.length;
	}

	for ( i = 0; i <= a.length; i++ )
	{
		d[ i ] = new Array();
		d[ i ][ 0 ] = i;
	}

	for ( j = 0; j <= b.length; j++ )
	{
		d[ 0 ][ j ] = j;
	}

	for ( i = 1; i <= a.length; i++ )
	{
		for ( j = 1; j <= b.length; j++ )
		{
			if ( a.charAt( i - 1 ) == b.charAt( j - 1 ) )
			{
				cost = 0;
			}
			else
			{
				cost = 1;
			}

			d[ i ][ j ] = Math.min( d[ i - 1 ][ j ] + 1, d[ i ][ j - 1 ] + 1, d[ i - 1 ][ j - 1 ] + cost );
			
			if(
				i > 1 && 
				j > 1 &&  
				a.charAt(i - 1) == b.charAt(j-2) && 
				a.charAt(i-2) == b.charAt(j-1)
				){
				d[i][j] = Math.min(
					d[i][j],
					d[i - 2][j - 2] + cost
					)

		}
	}
}

return d[ a.length ][ b.length ];
};

