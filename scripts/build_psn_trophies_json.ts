import * as fs from 'fs';
import fetch from 'node-fetch';

import type { Trophy } from "psn-api";
import {
    exchangeCodeForAccessToken,
    exchangeNpssoForCode,
    getTitleTrophies,
    getUserTitles,
    getUserTrophiesEarnedForTitle,
    makeUniversalSearch,
    TrophyRarity
} from "psn-api";

require('dotenv').config()

async function main() {
    // Get ENV
    const PSN_NPSSO = process.env["PSN_NPSSO"];
    const PSN_DATA_OUTPUT_FILEPATH = process.env["PSN_DATA_OUTPUT_FILEPATH"];
    const PSN_TARGET_ACCOUNT_ID = process.env["PSN_TARGET_ACCOUNT_ID"];

    const accessCode = await exchangeNpssoForCode(PSN_NPSSO);
    const authorization = await exchangeCodeForAccessToken(accessCode);

    const { trophyTitles } = await getUserTitles(authorization, "me");

    const titleIdMap = await buildTitleIdMap(authorization);

    const games: any[] = [];
    for (const title of trophyTitles) {
        // 4. Get the list of trophies for each of the user's titles.
        const { trophies: titleTrophies } = await getTitleTrophies(
            authorization,
            title.npCommunicationId,
            "all",
            {
                npServiceName:
                    title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            }
        );

        // 5. Get the list of _earned_ trophies for each of the user's titles.
        const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
            authorization,
            PSN_TARGET_ACCOUNT_ID,
            title.npCommunicationId,
            "all",
            {
                npServiceName:
                    title.trophyTitlePlatform !== "PS5" ? "trophy" : undefined
            }
        );

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
}

const buildTitleIdMap = async (
    authorization: any
): Promise<any> => {
    // This is atrocious, I am aware. TODO: clean this up.
    const URL = 'https://web.np.playstation.com/api/graphql/v1/op??operationName=getPurchasedGameList&variables={"isActive"%3Atrue%2C"platform"%3A["ps4"%2C"ps5"]%2C"size"%3A500%2C"start"%3A24%2C"sortBy"%3A"ACTIVE_DATE"%2C"sortDirection"%3A"desc"%2C"subscriptionService"%3A"NONE"}&extensions={"persistedQuery"%3A{"version"%3A1%2C"sha256Hash"%3A"2c045408b0a4d0264bb5a3edfed4efd49fb4749cf8d216be9043768adff905e2"}}';

    const titleIdMap = {};
    const response = await fetch(URL, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': 'Bearer ' + authorization.accessToken,
        },
    });
    const {data} = await response.json();
    console.log("Starting NpCommunicationId Linking");
    for (const game of data.purchasedTitlesRetrieve.games) {
        const npCommunicationData = await getNpCommunicationDataFromTitleId(authorization, game.name, game.titleId);
        if (npCommunicationData != null) {
            titleIdMap[npCommunicationData.id] = {
                ...game,
                ...npCommunicationData,
            };
        }
    }
    console.log("Finished NpCommunicationId Linking");

    return titleIdMap;
}

const getNpCommunicationDataFromTitleId = async (
    authorization: any,
    name: string,
    titleId: string,
): Promise<any> => {
    // This is atrocious, I am aware. TODO: clean this up.
    const URL = 'https://m.np.playstation.com/api/trophy/v1/users/me/titles/trophyTitles?npTitleIds=' + titleId;

    const response = await fetch(URL, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Authorization': 'Bearer ' + authorization.accessToken,
        },
    });
    const data = await response.json();
    if (data && data.titles[0].trophyTitles.length > 0) {
        console.log("Linked " + name + "[" + titleId + "] with " + data.titles[0].trophyTitles[0].npCommunicationId);
        return {
            id: data.titles[0].trophyTitles[0].npCommunicationId,
            gameImageUrl: data.titles[0].trophyTitles[0].trophyTitleIconUrl,
        };
    } else {
        return null;
    }
}

const mergeTrophyLists = (
    titleTrophies: Trophy[],
    earnedTrophies: Trophy[]
) => {
    const mergedTrophies: any[] = [];

    for (const earnedTrophy of earnedTrophies) {
        const foundTitleTrophy = titleTrophies.find(
            (t) => t.trophyId === earnedTrophy.trophyId
        );

        mergedTrophies.push(
            normalizeTrophy({ ...earnedTrophy, ...foundTitleTrophy })
        );
    }

    return mergedTrophies;
};

const normalizeTrophy = (trophy: Trophy) => {
    return {
        isEarned: trophy.earned ?? false,
        earnedOn: trophy.earned ? trophy.earnedDateTime : "unearned",
        type: trophy.trophyType,
        rarity: rarityMap[trophy.trophyRare ?? 0],
        earnedRate: Number(trophy.trophyEarnedRate),
        trophyName: trophy.trophyName,
        trophyIconUrl: trophy.trophyIconUrl,
        groupId: trophy.trophyGroupId
    };
};

const rarityMap: Record<TrophyRarity, string> = {
    [TrophyRarity.VeryRare]: "Very Rare",
    [TrophyRarity.UltraRare]: "Ultra Rare",
    [TrophyRarity.Rare]: "Rare",
    [TrophyRarity.Common]: "Common"
};

main();
