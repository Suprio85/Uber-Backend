import {Pool} from 'pg';
import dotenv from  'dotenv';

dotenv.config();


const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString : process.env.DATABASE_URL,
    ...(isProduction && {
        ssl : {
            rejectUnauthorized: false,
        },
    }),
});

export default pool;