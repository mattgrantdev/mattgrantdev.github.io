"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const psn_api_1 = require("psn-api");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Authenticate and become authorized with PSN.
        // See the Authenticating Manually docs for how to get your NPSSO.
        const accessCode = yield (0, psn_api_1.exchangeNpssoForCode)(process.env["NPSSO"]);
        const authorization = yield (0, psn_api_1.exchangeCodeForAccessToken)(accessCode);
        // 2. Get the user's `accountId` from the username.
        const allAccountsSearchResults = yield (0, psn_api_1.makeUniversalSearch)(authorization, "xelnia", "SocialAllAccounts");
        const targetAccountId = allAccountsSearchResults.domainResponses[0].results[0].socialMetadata
            .accountId;
        // 3. Get the user's list of titles (games).
        const { trophyTitles } = yield (0, psn_api_1.getUserTitles)(authorization, targetAccountId);
        const games = [];
        for (const title of trophyTitles) {
            // 4. Get the list of trophies for each of the user's titles.
            const { trophies: titleTrophies } = yield (0, psn_api_1.getTitleTrophies)(authorization, title.npCommunicationId, "all", {
                npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            });
            // 5. Get the list of _earned_ trophies for each of the user's titles.
            const { trophies: earnedTrophies } = yield (0, psn_api_1.getUserTrophiesEarnedForTitle)(authorization, targetAccountId, title.npCommunicationId, "all", {
                npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            });
            // 6. Merge the two trophy lists.
            const mergedTrophies = mergeTrophyLists(titleTrophies, earnedTrophies);
            games.push({
                gameName: title.trophyTitleName,
                platform: title.trophyTitlePlatform,
                trophyTypeCounts: title.definedTrophies,
                earnedCounts: title.earnedTrophies,
                trophyList: mergedTrophies
            });
        }
        // 7. Write to a JSON file.
        fs.writeFileSync("../_data/psn/games.json", JSON.stringify(games));
    });
}
const mergeTrophyLists = (titleTrophies, earnedTrophies) => {
    const mergedTrophies = [];
    for (const earnedTrophy of earnedTrophies) {
        const foundTitleTrophy = titleTrophies.find((t) => t.trophyId === earnedTrophy.trophyId);
        mergedTrophies.push(normalizeTrophy(Object.assign(Object.assign({}, earnedTrophy), foundTitleTrophy)));
    }
    return mergedTrophies;
};
const normalizeTrophy = (trophy) => {
    var _a, _b;
    return {
        isEarned: (_a = trophy.earned) !== null && _a !== void 0 ? _a : false,
        earnedOn: trophy.earned ? trophy.earnedDateTime : "unearned",
        type: trophy.trophyType,
        rarity: rarityMap[(_b = trophy.trophyRare) !== null && _b !== void 0 ? _b : 0],
        earnedRate: Number(trophy.trophyEarnedRate),
        trophyName: trophy.trophyName,
        groupId: trophy.trophyGroupId
    };
};
const rarityMap = {
    [psn_api_1.TrophyRarity.VeryRare]: "Very Rare",
    [psn_api_1.TrophyRarity.UltraRare]: "Ultra Rare",
    [psn_api_1.TrophyRarity.Rare]: "Rare",
    [psn_api_1.TrophyRarity.Common]: "Common"
};
main();
//# sourceMappingURL=build_psn_trophies_json.js.map