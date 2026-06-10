"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppearanceSettings } from "@/components/settings/appearance";
import { ModelsSettings } from "@/components/settings/models";
import { ConnectorsSettings } from "@/components/settings/connectors";
import { SkillsSettings } from "@/components/settings/skills";

export function SettingsView() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Réglages</h1>
      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">Apparence</TabsTrigger>
          <TabsTrigger value="models">Modèles</TabsTrigger>
          <TabsTrigger value="connectors">Connecteurs</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="models">
          <ModelsSettings />
        </TabsContent>
        <TabsContent value="connectors">
          <ConnectorsSettings />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
