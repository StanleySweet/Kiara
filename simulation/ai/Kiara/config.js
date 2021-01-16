var KIARA = function(m)
{

m.Config = function(difficulty, behavior)
{
	// 0 is sandbox, 1 is very easy, 2 is easy, 3 is medium, 4 is hard and 5 is very hard.
	this.difficulty = difficulty !== undefined ? difficulty : 3;

	// for instance "balanced", "aggressive" or "defensive"
	this.behavior = behavior || "random";

	// debug level: 0=none, 1=sanity checks, 2=debug, 3=detailed debug, -100=serializatio debug
	this.debug = 0;

	this.chat = true;	// false to prevent AI's chats

	this.popScaling = 1;	// scale factor depending on the max population
	
	this.Military = {
		"towerLapseTime": 5,	// Time to wait between building 2 towers
		"fortressLapseTime": 100,	// Time to wait between building 2 fortresses
		"popForBarracks1": 35,
		"popForBarracks2": 55,
		"popForBlacksmith": 65,
		"numSentryTowers": 3,
		"numFortresses": 2,
	};
	this.Economy = {
		"popPhase2": 80,	// How many units we want before aging to phase2.
		"workPhase3": 150,	// How many workers we want before aging to phase3.
		"workPhase4": 150,	// How many workers we want before aging to phase4 or higher.
		"popForDock": 25,
		"targetNumWorkers": 80,	// dummy, will be changed later
		"targetNumTraders": 5,	// Target number of traders
		"targetNumFishers": 2,	// Target number of fishers per sea
		"supportRatio": 0.35,	// fraction of support workers among the workforce
		"provisionFields": 8	
		};

	// Note: attack settings are set directly in attack_plan.js
	// defense
	this.Defense =
	{
		"defenseRatio": { "ally": 1.4, "neutral": 1.8, "own": 2 },	// ratio of defenders/attackers.
		"armyCompactSize": 2000,	// squared. Half-diameter of an army.
		"armyBreakawaySize": 3500,	// squared.
		"armyMergeSize": 1400	// squared.
	};

	// Additional buildings that the AI does not yet know when to build 
	// and that it will try to build on phase 3 when enough resources.
	this.buildings =
	{
		"default": [],
		"athen": ["structures/{civ}_gymnasion", "structures/{civ}_prytaneion", "structures/{civ}_royal_stoa"],
		"brit": ["structures/{civ}_rotarymill"],
		"cart": ["structures/{civ}_embassy_celtic", "structures/{civ}_embassy_iberian",
			 "structures/{civ}_embassy_italiote"],
		"gaul": ["structures/{civ}_rotarymill", "structures/{civ}_tavern"],
		"iber": ["structures/{civ}_monument"],
		"kush": ["structures/{civ}_nuba_village"],
		"mace": ["structures/{civ}_library"],
		"maur": ["structures/{civ}_pillar_ashoka"],
		"pers": [],
		"ptol": ["structures/{civ}_library"],
		"rome": ["structures/{civ}_army_camp"],
		"sele": ["structures/{civ}_library"],
		"spart": ["structures/{civ}_royal_stoa"]
	};

	this.priorities =
	{
	//	"villager": 30,      // should be slightly lower than the citizen soldier one to not get all the food
		"villager": 250,      // should be slightly lower than the citizen soldier one to not get all the food
	//	"citizenSoldier": 60,
		"citizenSoldier": 300,
		"trader": 50,
		"healer": 20,
		"ships": 70,
		"house": 350,
		"dropsites": 200,
		"field": 400,
		"dock": 90,
		"corral": 100,
		"economicBuilding": 90,
		"militaryBuilding": 130,
		"defenseBuilding": 70,
		"civilCentre": 950,
		"majorTech": 700,
		"minorTech": 270,
		"wonder": 1000,
		"emergency": 1000    // used only in emergency situations, should be the highest one
	};

	// Default personality (will be updated in setConfig)
	this.personality =
	{
		"aggressive": 0.5,
		"cooperative": 0.5,
		"defensive": 0.5
	};

	// See m.QueueManager.prototype.wantedGatherRates()
	this.queues =
	{
		"firstTurn": {
			"food": 10,
			"wood": 10,
			"default": 0
		},
		"short": {
			"food": 200,
			"wood": 100,
			"default": 80
		},
		"medium": {
			"food": 180,
			"default": 80
		},
		"long": {
			"food": 150,
			"default": 80
		}
	};

	this.garrisonHealthLevel = { "low": 0.4, "medium": 0.55, "high": 0.7 };
};

m.Config.prototype.setConfig = function(gameState)
{
	if (this.difficulty > 0)
	{
		// Setup personality traits according to the user choice:
		// The parameter used to define the personality is basically the aggressivity or (1-defensiveness)
		// as they are anticorrelated, although some small smearing to decorelate them will be added.
		// And for each user choice, this parameter can vary between min and max
		let personalityList = {
			"random": { "min": 0, "max": 1 },
			"defensive": { "min": 0, "max": 0.27 },
			"balanced": { "min": 0.37, "max": 0.63 },
			"aggressive": { "min": 0.73, "max": 1 }
		};
		let behavior = randFloat(-0.5, 0.5);
		// make agressive and defensive quite anticorrelated (aggressive ~ 1 - defensive) but not completelety
		let variation = 0.15 * randFloat(-1, 1) * Math.sqrt(Math.square(0.5) - Math.square(behavior));
		let aggressive = Math.max(Math.min(behavior + variation, 0.5), -0.5) + 0.5;
		let defensive = Math.max(Math.min(-behavior + variation, 0.5), -0.5) + 0.5;
		if (this.behavior == "defensive") {
			this.priorities.villager = 30;
			this.priorities.citizenSoldier = 60;
		}
		API3.warn(uneval(this.priorities));
		let min = personalityList[this.behavior].min;
		let max = personalityList[this.behavior].max;
		this.personality = {
			"aggressive": min + aggressive * (max - min),
			"defensive": 1 - max + defensive * (max - min),
			"cooperative": randFloat(0, 1)
		};
	}
	// Kiara usually uses the continuous values of personality.aggressive and personality.defensive
	// to define its behavior according to personality. But when discontinuous behavior is needed,
	// it uses the following personalityCut which should be set such that:
	// behavior="aggressive" => personality.aggressive > personalityCut.strong &&
	//                          personality.defensive  < personalityCut.weak
	// and inversely for behavior="defensive"
	this.personalityCut = { "weak": 0.3, "medium": 0.5, "strong": 0.7 };

	if (gameState.playerData.teamsLocked)
		this.personality.cooperative = Math.min(1, this.personality.cooperative + 0.30);
	else if (gameState.getAlliedVictory())
		this.personality.cooperative = Math.min(1, this.personality.cooperative + 0.15);

	let maxPop = gameState.getPopulationMax();
	this.Economy.targetNumWorkers = Math.max(1, Math.min(120, Math.floor(maxPop/3)));
	this.Economy.targetNumTraders = 20;

	if (gameState.getVictoryConditions().has("wonder"))
	{
		this.Economy.workPhase3 = Math.floor(0.9 * this.Economy.workPhase3);
		this.Economy.workPhase4 = Math.floor(0.9 * this.Economy.workPhase4);
	}

	if (maxPop < 300)
	{
		this.popScaling = Math.sqrt(maxPop / 300);
		this.Military.popForBarracks1 = Math.min(Math.max(Math.floor(this.Military.popForBarracks1 * this.popScaling), 15), Math.floor(maxPop*2/3));
		this.Military.popForBarracks2 = Math.min(Math.max(Math.floor(this.Military.popForBarracks2 * this.popScaling), 45), Math.floor(maxPop*2/3));
		this.Military.popForBlacksmith = Math.min(Math.max(Math.floor(this.Military.popForBlacksmith * this.popScaling), 30), Math.floor(maxPop/2));
	//	this.Economy.popPhase2 = Math.min(Math.max(Math.floor(this.Economy.popPhase2 * this.popScaling), 25), Math.floor(maxPop/2));
	//	this.Economy.workPhase3 = Math.min(Math.max(Math.floor(this.Economy.workPhase3 * this.popScaling), 40), Math.floor(maxPop*2/3));
		this.Economy.workPhase4 = Math.min(Math.max(Math.floor(this.Economy.workPhase4 * this.popScaling), 45), Math.floor(maxPop*2/3));
		this.Economy.targetNumTraders = Math.round(this.Economy.targetNumTraders * this.popScaling);
	}
//	this.Economy.targetNumWorkers = Math.max(this.Economy.targetNumWorkers, Math.floor(maxPop/2));
	this.Economy.workPhase3 = Math.min(this.Economy.workPhase3, this.Economy.targetNumWorkers);
	this.Economy.workPhase4 = Math.min(this.Economy.workPhase4, this.Economy.targetNumWorkers);

	if (this.debug < 2)
		return;
	API3.warn(" >>>  Kiara bot: personality = " + uneval(this.personality));
};

m.Config.prototype.Serialize = function()
{
	var data = {};
	for (let key in this)
		if (this.hasOwnProperty(key) && key != "debug")
			data[key] = this[key];
	return data;
};

m.Config.prototype.Deserialize = function(data)
{
	for (let key in data)
		this[key] = data[key];
};

return m;
}(KIARA);