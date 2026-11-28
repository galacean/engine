CREATE TABLE world_save (
  id VARCHAR(128) NOT NULL,
  generation VARCHAR(64) NOT NULL,
  part_no INT NOT NULL,
  payload VARCHAR(100000) NOT NULL,
  PRIMARY KEY (id)
)
