/**
* 1v1 Plugin
* because jd is a shit fucker
* by: panpawn
*/

exports.commands = {
	one: function (target, room, user, connection) {
		if (room.id !== '1v1') return this.sendReply("Hey u bish, get in 1v1 to use this command,,,");
		if (!this.canTalk()) return;
		if (!this.canBroadcast()) return;
		var one = toId(target);
		var reply = "";
		if (one === 'reg' || one === 'regular') reply = "Ubers excluding Lucario-Mega, Kangaskhan-Mega, and Gengar-Mega.";
		if (one === 'uu') reply = "Anything OU or above.";
		if (one === 'ru') reply = "Anything UU or above.";
		if (one === 'nu') reply = "Anything RU or above.";
		if (one === 'lc') reply = "Anything in LC Ubers, anything that cannot evolve, anything that has a pre-evolution.";
		if (one === 'ubers') reply = "Nothing but Ditto and Smeargle.";
		if (one === 'monoletter') reply = "A random letter is picked, only Pokemon starting with this letter can be used.";
		if (one === 'monotype') reply = "A random type is picked, only Pokemon of this type can be used.";
		if (one === 'monocolor') reply = "A random color is picked, only Pokemon of this color can be used. Helpul <a href=\"http://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_color\">Link</a>.";
		if (one === 'monopoke') reply =  "A random Pokemon is picked, and only that pokemon can be used.";
		if (one === 'monogen') reply = "A random Pokemon generation is picked, and only Pokemon from that gen can be used.";
		if (one === 'cap') reply = "Only Pokemon in the Create-a-Pokemon project can be used here. Ask staff for CAP Info.";
		if (one === 'eeveelutions') reply = "Only Eevee and its many evolutions can be used.";
		if (one === 'starters') reply = "Only Starter Pokemon (from any game) may be used.";
		if (one === 'bstbased') reply = "A random number from 180 to 780 is picked; this serves as the maximum BST for Pokemon in the tour.";
		if (one === 'l3') reply = "Similar to Catch and Evolve, here you choose a Pokemon in a triple elimination tour and evolve after each loss.  Information <a href=\"http://pastebin.com/6MMy5Vyu\">here</a>.";
		if (one === 'altered') reply = "These tours change the function/play of 1v1 in some way. Many of these aren’t in 1v1 formats so just to clarify, Focus Sash is banned.";
		if (one === 'inverse') reply = "1v1 Tour set in the Inverse Gamemode. Not-Very-Effective is not Super Effective and vice-versa. Ambipom is banned.";
		if (one === 'metronome') reply = "Only the move metronome is allowed in this tour, but on any Pokemon with a BST of 600 or less. It is in Custom Game, allowing a lot of creative freedom but has a pretty heavy <a href=\"http://pastebin.com/QPZBDzKb\">banlist</a>.";
		if (one === 'megaevos') reply = "Another Custom Game format, this one allowing only Mega Evolutions to be used (with items other than mega stones). Here is its <a href=\"http://pastebin.com/Q3j0d6He\">banlist</a>.";
		if (one === 'stabmons') reply = "Pokemon may use any move sharing a type with them in addition to normally learned moves.";
		if (one === 'aaa') reply = "Pokemon are allowed to have almost any ability, with Ubers banned in addition to everything on the thread <a href=\"http://www.smogon.com/forums/threads/almost-any-ability-xy-aaa-xy-other-metagame-of-the-month-may.3495737/\">here</a>, and sturdy.";
		if (one === 'alphabetcup') reply = " Abbreviated as \"abc cup,\" this is a 1v1 tour set in the alphabet cup <a href=\"http://www.smogon.com/forums/threads/alphabet-cup-other-metagame-of-the-month-march.3498167/">tier</a>.";
		if (one === 'averagemons') reply = "All stats of Pokemon are set to 100! See <a href=\"http://www.smogon.com/forums/threads/averagemons.3495527/\">here</a>. Selection: These formats require you to pick one Poke from a team of six.";
		if (one === 'selection') reply = "These formats require you to pick one Poke from a team of six.";
		if (one === 'abilityshift') reply = "Each Pokemon gains the ability that comes next in alphabetical order: <a href=\"http://www.smogon.com/forums/threads/ability-shift.3503100/\">Smogon Reference</a>, <a href=\"http://serebii.net/abilitydex/\">Serebii Reference</a>. No greninja or parental bond.";
		if (one === 'balancedhackmons' || one === 'bhacks') reply = "Straight up balanced hackmons 1v1. Almost anything goes. <a href=\"http://www.smogon.com/smog/issue21/hackmons\">Reference</a>. Selection: These tours require you to pick one Pokemon from a team of six.";
		if (one === 'ou') reply = "Bring an OU team and pick one, forfeit/be disqualified if it dies.";
		if (one === 'cc1v1') reply = "Six completely random (Moves, IVs, Species, Item, etc) pokemon are given to you to choose one. Pick the best one and try to win!";
		if (one === 'twovtwo') reply = "<br>These tours are 2v2 but have the flavor of 1v1 as they are set in the Doubles format.<br>- Reg 2v2: Everything banned in Smogon Doubles is banned here. 1 Focus sash maximum per team.<br>-Other 2v2s: UU2v2, RU2v2, NU2v2, LC2v2, and Ubers2v2 are all based on their respective mainstream tierlists. If this option is picked, a poll presenting those five options is given for 30 seconds. One Focus Sash maximum per team.";
		if (one === 'poll') me.chat('/poll Which 1v1 Type?, reg, uu, ru, nu, lc, ubers, monoletter, monotype, monocolor, monopoke, monogen, cap, starters, eeveelutions, bst-based, l&e, inverse, metronome, mega evos, stabmons 1v1, aaa 1v1, abc cup, averagemons, abilityshift, balancedhackmons, ou choice, cc1v1, 2v2, other 2v2',room,connection);
		if (!one || one === 'help' || one === 'help' || one === 'git') reply = "For help, see <a href=\"https://raw.githubusercontent.com/jd4565/Pokemon-Showdown/master/chat-plugins/1v1.js\">here</a>.";
		
		this.sendReplyBox("<b>" + one + "</b> - " + reply);
	}
};
