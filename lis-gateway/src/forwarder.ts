import axios from 'axios';
import * as dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

const API_URL = process.env.LIS_API_URL;
const API_KEY = process.env.LIS_API_KEY;

export class Forwarder {
    async forward(instrumentId: string, rawMessage: string) {
        if (!API_URL || !API_KEY) {
            logger.error('API_URL or API_KEY not configured in .env', 'Forwarder');
            return;
        }

        try {
            logger.log(`Forwarding message for instrument ${instrumentId}...`, 'Forwarder');

            const response = await axios.post(
                `${API_URL}/instruments/${instrumentId}/simulate`,
                { rawMessage },
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.success) {
                logger.log(`Successfully forwarded message. LIS Message ID: ${response.data.messageId}`, 'Forwarder');
            } else {
                logger.warn(`Forwarded with warning: ${response.data.message}`, 'Forwarder');
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.message;
            logger.error(`Failed to forward message: ${errorMsg}`, 'Forwarder');
        }
    }
}

export const forwarder = new Forwarder();
