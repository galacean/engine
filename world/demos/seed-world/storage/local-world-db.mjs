// Standalone development SDK for the world_save statements in SharedWorldStorage.
// Also distributed to the PUGC scaffold's Vite development entry.
const selectHead = "select payload as payload from world_save where id = ? limit 2";
const selectArchive = "select payload as payload from world_save where generation = ? and id <= ? and part_no > ? order by id desc limit 1";
const sealArchive = "update world_save set payload = ?, part_no = ? where id = ? and part_no < ?";
const selectParts = "select part_no as partno, payload as payload from world_save where generation = ? and part_no >= ? order by part_no asc limit ?";
const selectGenerations = "select generation as generation from world_save where generation > ? order by generation asc limit ?";
const insert = "insert into world_save (id, generation, part_no, payload) values (?, ?, ?, ?)";
const update = "update world_save set payload = ? where id = ?";
const compareAndSet = update + " and payload = ?";
const remove = "delete from world_save where generation = ?";

function openDatabase(name, create = true) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let missing = false;
    request.onupgradeneeded = () => {
      if (!create) {
        missing = true;
        request.transaction.abort();
        return;
      }
      const rows = request.result.createObjectStore("world_save", { keyPath: "id" });
      rows.createIndex("generation", "generation");
      rows.createIndex("parts", ["generation", "part_no"]);
    };
    request.onerror = () => missing ? resolve(undefined) : reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * @template T
 * @param {IDBDatabase} db
 * @param {IDBTransactionMode} mode
 * @param {(rows: IDBObjectStore, done: (data: T) => void) => void} operation
 * @returns {Promise<T>}
 */
function transact(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("world_save", mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error("Local world transaction aborted"));
    try {
      operation(tx.objectStore("world_save"), value => { result = value; });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

function checkPayload(value) {
  if (typeof value !== "string") throw new Error("world_save.payload requires a string");
  if (value.length <= 100000) return;
  // The SDK counts characters. Supplementary Unicode characters occupy two UTF-16 units.
  let count = 0;
  for (const _character of value) {
    if (++count > 100000) throw new Error("world_save.payload exceeds 100000 characters");
  }
}

function query(rows, sql, binds, done) {
  if (sql === selectHead) {
    const request = rows.get(binds[0]);
    request.onsuccess = () => done(request.result ? [{ payload: request.result.payload }] : []);
  } else if (sql === selectArchive) {
    const [generation, last, part] = binds;
    const range = IDBKeyRange.bound(generation + "-", last);
    const request = rows.openCursor(range, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) done([]);
      else if (cursor.value.generation === generation && cursor.value.part_no > part)
        done([{ payload: cursor.value.payload }]);
      else cursor.continue();
    };
  } else if (sql === selectParts) {
    const [generation, firstPart, limit] = binds;
    const range = IDBKeyRange.bound([generation, firstPart], [generation, Infinity]);
    const request = rows.index("parts").getAll(range, limit);
    request.onsuccess = () => done(request.result.map(row => ({ partNo: row.part_no, payload: row.payload })));
  } else if (sql === selectGenerations) {
    const [after, limit] = binds;
    const result = [];
    const request = rows.index("generation").openKeyCursor(IDBKeyRange.lowerBound(after, true));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) result.push({ generation: cursor.key });
      if (cursor && result.length < limit) cursor.continue();
      else done(result);
    };
  } else {
    throw new Error("Unsupported local world query: " + sql);
  }
}

function execute(rows, sql, binds, done) {
  if (sql === insert) {
    const [id, generation, part_no, payload] = binds;
    checkPayload(payload);
    rows.add({ id, generation, part_no, payload });
    done({ rowsAffected: 1 });
  } else if (sql === update || sql === compareAndSet) {
    const [payload, id, previous] = binds;
    checkPayload(payload);
    const request = rows.get(id);
    request.onsuccess = () => {
      const row = request.result;
      const matches = row && (sql === update || row.payload === previous);
      if (matches) rows.put({ ...row, payload });
      done({ rowsAffected: matches ? 1 : 0 });
    };
  } else if (sql === sealArchive) {
    const [payload, part_no, id, limit] = binds;
    checkPayload(payload);
    const request = rows.get(id);
    request.onsuccess = () => {
      const row = request.result;
      const changed = row && row.part_no < limit;
      if (changed) rows.put({ ...row, payload, part_no });
      done({ rowsAffected: changed ? 1 : 0 });
    };
  } else if (sql === remove) {
    const request = rows.index("generation").openKeyCursor(IDBKeyRange.only(binds[0]));
    let count = 0;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return done({ rowsAffected: count });
      rows.delete(cursor.primaryKey);
      count++;
      cursor.continue();
    };
  } else {
    throw new Error("Unsupported local world execute: " + sql);
  }
}

export function createLocalWorldDb(name, { create = true } = {}) {
  const databaseName = "lingguang-world-save:" + JSON.stringify(name);
  /** @template T
   * @param {IDBTransactionMode} mode
   * @param {(rows: IDBObjectStore, sql: string, binds: Array<string | number>, done: (data: T) => void) => void} operation
   * @param {{ sql: string, binds: Array<string | number> }} input
   * @param {T} emptyData
   */
  async function run(mode, operation, input, emptyData) {
    let db;
    try {
      db = await openDatabase(databaseName, create);
      if (!db) return { success: true, data: emptyData };
      const sql = input.sql.trim().replace(/;$/, "").replace(/\s+/g, " ").toLowerCase();
      return { success: true, data: await transact(db, mode, (rows, done) => operation(rows, sql, input.binds, done)) };
    } catch (error) {
      return { success: false, data: emptyData, message: String(error?.message || error) };
    } finally {
      db?.close();
    }
  }
  return {
    role: async () => ({ role: "MANAGER" }),
    query: input => run("readonly", query, input, []),
    execute: input => run("readwrite", execute, input, { rowsAffected: 0 })
  };
}
