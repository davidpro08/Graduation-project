import { Module } from "@nestjs/common";
import { JEV_CLIENT } from "./jev.client";
import { JEV_CONFIG, readJevConfig } from "./jev.config";
import { JevService } from "./jev.service";
import { TypeSafeJev } from "./typesafe-jev";

@Module({
  providers: [
    { provide: JEV_CONFIG, useFactory: () => readJevConfig() },
    { provide: JEV_CLIENT, useClass: TypeSafeJev },
    JevService,
  ],
  exports: [JevService],
})
export class AiModule {}
