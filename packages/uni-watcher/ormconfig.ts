import fs from 'fs-extra';
import toml from 'toml';
import { DEFAULT_CONFIG_PATH } from '@vulcanize/util';

const getConfig = () => {
  const config = toml.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
  const dbConfig = {
    ...config.database,
    entities: ['src/entity/*'],
    migrations: ['src/migration/*.ts'],
    cli: {
      migrationsDir: 'src/migration'
    }
  };

  return dbConfig;
};

const dbconfig = getConfig();
export default dbconfig;
