
import mongoose, {
  type Connection,
} from "mongoose";
import type { Db } from "mongodb";

let connectionPromise: Promise<Db> | null = null;

function resolveDatabaseName(uri: string): string {
  const configuredName = process.env.MONGODB_DB_NAME?.trim();

  if (configuredName) return configuredName;

  try {
    const pathName = new URL(uri).pathname
      .replace(/^\/+/, "")
      .trim();

    return pathName
      ? decodeURIComponent(pathName)
      : "ads_management";
  } catch {
    return "ads_management";
  }
}

export async function connectToMongoDB(): Promise<Db> {
  if (
    mongoose.connection.readyState === 1 &&
    mongoose.connection.db
  ) {
    return mongoose.connection.db;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGO_URI?.trim();

  if (!uri) {
    throw new Error(
      "MONGO_URI is missing. Configure MongoDB before starting the API."
    );
  }

  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        dbName: resolveDatabaseName(uri),
      });

      const database = mongoose.connection.db;

      if (!database) {
        throw new Error(
          "MongoDB connection established, but database handle is unavailable."
        );
      }

      await database.command({ ping: 1 });

      console.log(
        `Connected to MongoDB using Mongoose: ${database.databaseName}`
      );

      return database;
    } catch (error) {
      await mongoose.disconnect().catch(() => undefined);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Legacy native MongoDB database access.
 * Keep temporarily for existing code that uses db.collection().
 * New application models should use Mongoose.
 */
export function getDatabase(): Db {
  if (
    mongoose.connection.readyState !== 1 ||
    !mongoose.connection.db
  ) {
    throw new Error(
      "MongoDB is not connected. Call connectToMongoDB() first."
    );
  }

  return mongoose.connection.db;
}

/**
 * Returns the active default Mongoose connection.
 */
export function getMongooseConnection(): Connection {
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "Mongoose is not connected. Call connectToMongoDB() first."
    );
  }

  return mongoose.connection;
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function disconnectFromMongoDB(): Promise<void> {
  await mongoose.disconnect();
  connectionPromise = null;

  console.log("Disconnected from MongoDB.");
}
