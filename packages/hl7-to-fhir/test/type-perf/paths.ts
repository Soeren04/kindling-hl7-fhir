// Compiled alone by `pnpm check:type-performance` to measure what the path checks cost the type checker: every call
// below is one literal the checker has to validate. The budget in package.json fails the build when a change makes
// the checks much more expensive.
import { get, getAll, isNull } from "../../src/hl7v2/access";
import type { Hl7Message } from "../../src/hl7v2/model";

declare const message: Hl7Message;
declare const path: string;

get(message, "MSH.1");
get(message, "MSH.2");
get(message, "MSH.9.2");
get(message, "MSH.12");
get(message, "PID.3.1");
get(message, "PID.5.1");
get(message, "PID.5.2");
get(message, "PID.7");
get(message, "PID.8");
get(message, "PID.11.1.1");
get(message, "PID[1].18.1");
get(message, "PV1.2");
get(message, "PV1.3.1");
get(message, "PV1.44");
get(message, "OBR.4.2");
get(message, "OBR[2].7");
get(message, "OBX.2");
get(message, "OBX[3].5");
get(message, "OBX[3].5.1.1");
get(message, "NTE[12].3");
get(message, "ZPI.10.20.30");
get(message, "ZPI.3");
get(message, "IN1.36");
getAll(message, "PID.3");
getAll(message, "PID.3.1");
getAll(message, "PID.3[2].1");
getAll(message, "PID.13.1");
getAll(message, "PID.5.1");
getAll(message, "OBX.3.1");
getAll(message, "OBX.5");
getAll(message, "OBX[10].5[3]");
getAll(message, "OBR.3.1");
getAll(message, "NTE.3");
getAll(message, "NTE[2].3");
getAll(message, "ZPI.1");
getAll(message, "DG1.3.1");
getAll(message, "AL1.3.2");
getAll(message, "IN1.2.1");
getAll(message, "ORC.2.1");
isNull(message, "PID.5");
isNull(message, "PID.7");
isNull(message, "PID.8");
isNull(message, "PID.11.1");
isNull(message, "PID.13[2]");
isNull(message, "PV1.3");
isNull(message, "OBX.5");
isNull(message, "OBX[4].5.1");
isNull(message, "OBR.4");
isNull(message, "NTE.3");
isNull(message, "ZPI.2.3.4");
isNull(message, "IN1.5");
isNull(message, "AL1.3.1");
isNull(message, "DG1.4");
isNull(message, "ORC.9.1");

// Strings that are not literals are not checked and must stay cheap.
get(message, path);
getAll(message, `PID.${path}`);
isNull(message, path);

// @ts-expect-error -- an empty part
get(message, "PID..5");
// @ts-expect-error -- not a number
getAll(message, "PID.x");
// @ts-expect-error -- no field
isNull(message, "PID");
