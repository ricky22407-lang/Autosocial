
// ... 保持其他不變 ...
                // === CASE B: TOP-UP or BOOST ===
                else if (type === 'TOPUP' || type === 'AS') {
                    // 若金額為 500，且來自 Marketplace，視為加值 Boost
                    const tradeAmt = parseInt(TradeAmt);
                    
                    if (tradeAmt === 500) {
                        const boostDays = 10;
                        const boostExpiry = now + (boostDays * 24 * 60 * 60 * 1000);
                        
                        await userRef.update({
                            'influencerProfile.boostExpiresAt': boostExpiry,
                            'updated_at': now
                        });
                        console.log(`[Boost] User ${uid} boosted until ${new Date(boostExpiry).toISOString()}`);
                    } else {
                        // 一般加值點數邏輯
                        const pointsToAdd = tradeAmt;
                        // ... 原有加點邏輯 ...
                    }
                }
// ... 保持其他不變 ...
