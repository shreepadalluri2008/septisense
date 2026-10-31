import React from "react";
import { ShieldCheck, Info } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-slate-950 border-t border-slate-800/80 px-6 py-4 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-400/90 font-medium bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
          <Info className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>REGULATORY NOTICE:</strong> Educational and research prototype. Not clinically validated. Not a substitute for medical advice.
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            PhysioNet CinC 2017/2019 & MIT-BIH Datasets
          </span>
          <span>•</span>
          <span>LightGBM (AUROC 0.7205) + Pan-Tompkins QRS</span>
          <span>•</span>
          <span>SeptiSense v1.0.0</span>
        </div>
      </div>
    </footer>
  );
};
