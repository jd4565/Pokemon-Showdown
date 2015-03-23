/**
 * Frost's Events Plugin
 * This is a file that contains new 
 * event based commands that are to
 * aid the staff in running events
 * By: panpawn
 */
 
exports.commands = {
	monothreat: function(target, room, user, connection) {
		 if (!this.can('lock')) return false;
		 var type = toId(target.slice(0, target.indexOf(',')));
		 var time = target.slice(target.indexOf(',') + 1).trim();
		 if (!(type || time)) return this.sendReply("Usage: /monothreat [type], [number of minutes until it starts]");
		 var declare_html = "<table bgcolor=\"#CBFFFA\" width=\"100%\"><td><center><h1>Frost Monothread is starting soon!</center></h1><br />" +
							"- The type is " + type +"!<br />" +
							"- It starts in " + time + "minutes!<br />" +
							"<button name=\"send\" value=\"/join monotype\">Click here to join!</button><br />" +
							"<i><font color=\"gray\">(Declared by " + user.name + ")";
		 for (var id in Rooms.rooms) {
			if (id !== 'global')
			if (Rooms.rooms[id].type !== 'battle') Rooms.rooms[id].addRaw(declare_html);
		}
		this.logModCommand(user.name + " has declared the Monothread for type: " + type + ", in " + time + " minutes.");
	}
};
// More to be added soon~
