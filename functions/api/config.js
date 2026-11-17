import { flags } from '../_lib/catalogue.js';
import { json } from '../_lib/http.js';

// Tells the website whether the billing system is switched on. Nothing secret is returned.
export const onRequestGet = ({ env }) => json(flags(env));
