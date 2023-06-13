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
const node_fetch_1 = require("node-fetch");
const psn_api_1 = require("psn-api");
require('dotenv').config();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get ENV
        const PSN_NPSSO = process.env["PSN_NPSSO"];
        const PSN_DATA_OUTPUT_FILEPATH = process.env["PSN_DATA_OUTPUT_FILEPATH"];
        const PSN_TARGET_ACCOUNT_ID = process.env["PSN_TARGET_ACCOUNT_ID"];
        const accessCode = yield (0, psn_api_1.exchangeNpssoForCode)(PSN_NPSSO);
        const authorization = yield (0, psn_api_1.exchangeCodeForAccessToken)(accessCode);
        const { trophyTitles } = yield (0, psn_api_1.getUserTitles)(authorization, "me");
        const titleIdMap = yield buildTitleIdMap(authorization);
        const games = [];
        for (const title of trophyTitles) {
            // 4. Get the list of trophies for each of the user's titles.
            const { trophies: titleTrophies } = yield (0, psn_api_1.getTitleTrophies)(authorization, title.npCommunicationId, "all", {
                npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            });
            // 5. Get the list of _earned_ trophies for each of the user's titles.
            const { trophies: earnedTrophies } = yield (0, psn_api_1.getUserTrophiesEarnedForTitle)(authorization, PSN_TARGET_ACCOUNT_ID, title.npCommunicationId, "all", {
                npServiceName: title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            });
            // 6. Merge the two trophy lists.
            const mergedTrophies = mergeTrophyLists(titleTrophies, earnedTrophies);
            games.push({
                gameName: title.trophyTitleName,
                platform: title.trophyTitlePlatform,
                trophyTypeCounts: title.definedTrophies,
                earnedCounts: title.earnedTrophies,
                trophyList: mergedTrophies,
                gameDetails: titleIdMap[title.npCommunicationId]
            });
        }
        // 7. Write to a JSON file.
        fs.writeFileSync(PSN_DATA_OUTPUT_FILEPATH, JSON.stringify(games, null, 2));
    });
}
const buildTitleIdMap = (authorization) => __awaiter(void 0, void 0, void 0, function* () {
    // This is atrocious, I am aware. TODO: clean this up.
    const URL = 'https://web.np.playstation.com/api/graphql/v1/op??operationName=getPurchasedGameList&variables={"isActive"%3Atrue%2C"platform"%3A["ps4"%2C"ps5"]%2C"size"%3A500%2C"start"%3A24%2C"sortBy"%3A"ACTIVE_DATE"%2C"sortDirection"%3A"desc"%2C"subscriptionService"%3A"NONE"}&extensions={"persistedQuery"%3A{"version"%3A1%2C"sha256Hash"%3A"2c045408b0a4d0264bb5a3edfed4efd49fb4749cf8d216be9043768adff905e2"}}';
    const titleIdMap = {};
    const response = yield (0, node_fetch_1.default)(URL, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': 'Bearer ' + authorization.accessToken,
        },
    });
    const { data } = yield response.json();
    console.log("Starting NpCommunicationId Linking");
    for (const game of data.purchasedTitlesRetrieve.games) {
        const npCommunicationData = yield getNpCommunicationDataFromTitleId(authorization, game.name, game.titleId);
        if (npCommunicationData != null) {
            titleIdMap[npCommunicationData.id] = Object.assign(Object.assign({}, game), npCommunicationData);
        }
    }
    console.log("Finished NpCommunicationId Linking");
    return titleIdMap;
});
const getNpCommunicationDataFromTitleId = (authorization, name, titleId) => __awaiter(void 0, void 0, void 0, function* () {
    // This is atrocious, I am aware. TODO: clean this up.
    const URL = 'https://m.np.playstation.com/api/trophy/v1/users/me/titles/trophyTitles?npTitleIds=' + titleId;
    const response = yield (0, node_fetch_1.default)(URL, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': 'Bearer ' + authorization.accessToken,
        },
    });
    const data = yield response.json();
    if (data && data.titles[0].trophyTitles.length > 0) {
        console.log("Linked " + name + "[" + titleId + "] with " + data.titles[0].trophyTitles[0].npCommunicationId);
        return {
            id: data.titles[0].trophyTitles[0].npCommunicationId,
            gameImageUrl: data.titles[0].trophyTitles[0].trophyTitleIconUrl,
        };
    }
    else {
        return null;
    }
});
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
        trophyIconUrl: trophy.trophyIconUrl,
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