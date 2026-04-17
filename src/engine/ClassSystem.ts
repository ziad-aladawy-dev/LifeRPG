// ============================================================================
// Life RPG — Class System
// Defines Character Classes, their lore, and their level-based Ranks.
// ============================================================================

export interface ClassRank {
	levelThreshold: number;
	title: string;
}

export interface CharacterClass {
	id: string;
	name: string;
	description: string;
	ranks: ClassRank[];
}

export const CHARACTER_CLASSES: Record<string, CharacterClass> = {
	adventurer: {
		id: "adventurer",
		name: "Adventurer",
		description: "A jack-of-all-trades, master of taking the first step.",
		ranks: [
			{ levelThreshold: 100, title: "Legend of the Realm" },
			{ levelThreshold: 90, title: "Mythic Hero" },
			{ levelThreshold: 80, title: "Champion of the People" },
			{ levelThreshold: 70, title: "Grandmaster Explorer" },
			{ levelThreshold: 60, title: "Master of the Wilds" },
			{ levelThreshold: 50, title: "Renowned Pathfinder" },
			{ levelThreshold: 40, title: "Veteran Wayfarer" },
			{ levelThreshold: 35, title: "Seasoned Pioneer" },
			{ levelThreshold: 30, title: "Elite Ranger" },
			{ levelThreshold: 25, title: "Journeyman Tracker" },
			{ levelThreshold: 20, title: "Proven Scout" },
			{ levelThreshold: 15, title: "Capable Guide" },
			{ levelThreshold: 10, title: "Trailblazer" },
			{ levelThreshold: 5, title: "Wanderer" },
			{ levelThreshold: 1, title: "Novice Traveler" },
		],
	},
	mage: {
		id: "mage",
		name: "Mage",
		description: "A scholar of the arcane arts and deep lore.",
		ranks: [
			{ levelThreshold: 100, title: "Weaver of Reality Itself" },
			{ levelThreshold: 90, title: "Sovereign of the Ley Lines" },
			{ levelThreshold: 80, title: "Archmage of the Astral Plane" },
			{ levelThreshold: 70, title: "Grand Magus of the Sanctum" },
			{ levelThreshold: 60, title: "Master of the Grimoire" },
			{ levelThreshold: 50, title: "High Sorcerer of the Ward" },
			{ levelThreshold: 40, title: "Arcanist of the Deep Lore" },
			{ levelThreshold: 35, title: "Magus of the Silver Circle" },
			{ levelThreshold: 30, title: "Scholar of the Ether" },
			{ levelThreshold: 25, title: "Adept of the Hidden Runes" },
			{ levelThreshold: 20, title: "Journeyman Spellcaster" },
			{ levelThreshold: 15, title: "Mystic Initiate" },
			{ levelThreshold: 10, title: "Scribe of the First Tome" },
			{ levelThreshold: 5, title: "Apprentice Weaver" },
			{ levelThreshold: 1, title: "Neophyte of the Spark" },
		],
	},
	warrior: {
		id: "warrior",
		name: "Warrior",
		description: "A master of martial combat and unyielding endurance.",
		ranks: [
			{ levelThreshold: 100, title: "Avatar of War" },
			{ levelThreshold: 90, title: "Warlord of the Vanguard" },
			{ levelThreshold: 80, title: "Grand Marshal of the Realm" },
			{ levelThreshold: 70, title: "Champion of the Colosseum" },
			{ levelThreshold: 60, title: "Master of the Blade" },
			{ levelThreshold: 50, title: "High Commander" },
			{ levelThreshold: 40, title: "Knight of the Iron Will" },
			{ levelThreshold: 35, title: "Captain of the Guard" },
			{ levelThreshold: 30, title: "Veteran Centurion" },
			{ levelThreshold: 25, title: "Elite Gladiator" },
			{ levelThreshold: 20, title: "Journeyman Sentinel" },
			{ levelThreshold: 15, title: "Proven Shield-Bearer" },
			{ levelThreshold: 10, title: "Stalwart Defender" },
			{ levelThreshold: 5, title: "Squire of the Sword" },
			{ levelThreshold: 1, title: "Recruit of the Militia" },
		],
	},
	rogue: {
		id: "rogue",
		name: "Rogue",
		description: "A cunning operative dealing in stealth and precision.",
		ranks: [
			{ levelThreshold: 100, title: "Phantom of the Abyss" },
			{ levelThreshold: 90, title: "Grandmaster of Shadows" },
			{ levelThreshold: 80, title: "Night Terror" },
			{ levelThreshold: 70, title: "Master Assassin" },
			{ levelThreshold: 60, title: "Lord of the Syndicate" },
			{ levelThreshold: 50, title: "High Shadow" },
			{ levelThreshold: 40, title: "Elite Nightblade" },
			{ levelThreshold: 35, title: "Phantom Operative" },
			{ levelThreshold: 30, title: "Silent Stalker" },
			{ levelThreshold: 25, title: "Adept of the Hidden Dagger" },
			{ levelThreshold: 20, title: "Journeyman Thief" },
			{ levelThreshold: 15, title: "Shadow Initiate" },
			{ levelThreshold: 10, title: "Cunning Cutpurse" },
			{ levelThreshold: 5, title: "Apprentice Prowler" },
			{ levelThreshold: 1, title: "Novice Pickpocket" },
		],
	},
};

/**
 * Returns the correct title based on the character's current level and class.
 */
export function getCharacterRank(level: number, classId: string): string {
	const charClass = CHARACTER_CLASSES[classId];
	if (!charClass) return "Unknown Entity";

	// Assumes ranks array is sorted descending (highest level threshold first)
	for (const rank of charClass.ranks) {
		if (level >= rank.levelThreshold) {
			return rank.title;
		}
	}

	// Fallback if below level 1 (should never happen)
	return charClass.ranks[charClass.ranks.length - 1].title;
}

/**
 * Helper to check if a specific level is a Rank Up threshold for the given class
 */
export function getRankUpTitle(level: number, classId: string): string | null {
	const charClass = CHARACTER_CLASSES[classId];
	if (!charClass) return null;

	const rankObj = charClass.ranks.find(r => r.levelThreshold === level);
	return rankObj ? rankObj.title : null;
}
