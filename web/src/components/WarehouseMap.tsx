import { useMemo, useState } from "react";
import { buildLayout, shortLabel, type AisleNode, type ZoneNode } from "../lib/layout";
import { fmtNumber } from "../lib/format";
import type { Location } from "../lib/types";
import { Icon } from "./Icon";
import { Modal } from "./ui";

// Floor plan of a warehouse: zones as areas, aisles as columns (each rack a
// bar that fills with stock). Clicking an aisle opens its racks drawn as
// shelves; clicking a position selects that location.

interface Props {
  locations: Location[];
  /** Units on hand per location id; locations missing from the map are empty. */
  occupancy: Map<string, number>;
  selectedId?: string;
  onSelect: (location: Location) => void;
  /** Hint shown in the aisle dialog, e.g. "Elige la ubicación a contar". */
  prompt?: string;
}

const containsId = (aisle: AisleNode, id?: string) => !!id && aisle.racks.some(r => r.positions.some(p => p.location._id === id));

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-emerald-400 bg-emerald-100" /> Ocupada</span>
      <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-dashed border-slate-300 bg-white" /> Vacía</span>
      <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded border border-indigo-600 bg-indigo-600" /> Elegida</span>
    </div>
  );
}

function AisleTile({ aisle, selected, onClick }: { aisle: AisleNode; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      aria-label={`${aisle.name}, ${aisle.occupied} de ${aisle.total} posiciones ocupadas`}
      className={`relative flex min-h-24 w-16 flex-col items-center rounded-lg border bg-white py-1.5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${selected ? "border-2 border-indigo-600" : "border-slate-300"}`}
    >
      <span className="max-w-full overflow-x-auto whitespace-nowrap px-1 text-xs font-semibold leading-4 text-slate-700">{shortLabel(aisle.name)}</span>
      <span className="flex w-full flex-1 flex-col justify-center gap-1 px-1.5 py-1.5">
        {aisle.racks.map(rack => (
          <span key={rack.name} className="block h-2.5 overflow-hidden rounded-sm bg-slate-200">
            <span className="block h-full bg-emerald-400" style={{ width: `${rack.positions.length ? (rack.occupied / rack.positions.length) * 100 : 0}%` }} />
          </span>
        ))}
      </span>
      <span className="max-w-full overflow-x-auto whitespace-nowrap px-1 text-xs font-medium leading-4 text-slate-600">{aisle.occupied}/{aisle.total}</span>
      {selected && <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl-lg bg-indigo-600 text-white"><Icon name="check" size={10} /></span>}
    </button>
  );
}

function AisleDialog({ zone, aisle, selectedId, prompt, onPick, onClose }: {
  zone: ZoneNode; aisle: AisleNode; selectedId?: string; prompt: string; onPick: (l: Location) => void; onClose: () => void;
}) {
  return (
    <Modal open title={`${zone.name} · ${aisle.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">{prompt}</p>
      <div className="flex flex-col gap-5">
        {aisle.racks.map(rack => (
          <div key={rack.name}>
            <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-2">
              <h3 className="min-w-0 overflow-x-auto whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-700">{rack.name}</h3>
              <span className="shrink-0 text-xs leading-4 text-slate-600">{rack.occupied} de {rack.positions.length} ocupadas</span>
            </div>
            {/* The shelf: frame, positions, bottom plank */}
            <div className="rounded-md border-2 border-slate-400 bg-slate-100 p-2">
              <div className="flex flex-wrap gap-2">
                {rack.positions.map(p => {
                  const selected = p.location._id === selectedId;
                  const inactive = p.location.active === false;
                  const tone = selected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : p.units > 0 ? "border-emerald-400 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                    : "border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-50";
                  return (
                    <button
                      key={p.location._id} type="button" onClick={() => onPick(p.location)}
                      aria-pressed={selected}
                      aria-label={`${p.location.code}, ${p.units > 0 ? `${p.units} unidades` : "vacía"}${inactive ? ", inactiva" : ""}`}
                      className={`flex h-16 w-20 flex-col items-center justify-center rounded-md border-[1.5px] text-center transition ${tone} ${inactive ? "opacity-50" : ""}`}
                    >
                      <Icon name={selected ? "check" : "inventory"} size={16} />
                      <span className="mt-0.5 max-w-full overflow-x-auto whitespace-nowrap px-1 text-xs font-semibold leading-4">{p.label}</span>
                      <span className="max-w-full overflow-x-auto whitespace-nowrap px-1 text-xs leading-4">{inactive ? "inactiva" : p.units > 0 ? `${fmtNumber(p.units)} ud.` : "vacía"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mx-1 h-1.5 rounded-b bg-slate-400" />
          </div>
        ))}
      </div>
      <div className="mt-5"><Legend /></div>
    </Modal>
  );
}

export function WarehouseMap({ locations, occupancy, selectedId, onSelect, prompt = "Haz clic en la posición que quieres elegir." }: Props) {
  const zones = useMemo(() => buildLayout(locations, occupancy), [locations, occupancy]);
  const [open, setOpen] = useState<{ zone: ZoneNode; aisle: AisleNode } | null>(null);

  if (!zones.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <Icon name="location" size={24} className="text-slate-400" />
        <p className="text-sm text-slate-500">Este almacén aún no tiene ubicaciones.</p>
      </div>
    );
  }

  return (
    <div>
      {/* The floor: a dashed outline with the access strip at the bottom */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-slate-400 bg-slate-200/50 p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {zones.map(zone => (
            <div key={zone.name} className="rounded-xl border border-slate-300 bg-slate-100 p-3">
              <div className="mb-2 flex min-w-0 items-baseline justify-between gap-2">
                <h3 className="min-w-0 overflow-x-auto whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-700">{zone.name}</h3>
                <span className="shrink-0 text-xs leading-4 text-slate-600">{zone.occupied}/{zone.total} ocupadas</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {zone.aisles.map(aisle => (
                  <AisleTile key={aisle.name} aisle={aisle} selected={containsId(aisle, selectedId)} onClick={() => setOpen({ zone, aisle })} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="-mb-3 flex items-center gap-1.5 self-center rounded-t-lg bg-slate-300 px-4 py-1 text-xs font-semibold uppercase leading-4 tracking-wide text-slate-700">
          <Icon name="download" size={12} /> Acceso / andén
        </div>
      </div>
      <div className="mt-5"><Legend /></div>

      {open && (
        <AisleDialog
          zone={open.zone} aisle={open.aisle} selectedId={selectedId} prompt={prompt}
          onPick={l => { setOpen(null); onSelect(l); }} onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
