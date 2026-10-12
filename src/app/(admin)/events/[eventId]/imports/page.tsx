"use client";

import { useState, Suspense } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { processRegistrationImport } from "@/app/actions/importData";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { FileUp, Download, CheckCircle2, Users, ArrowRight, QrCode } from "lucide-react";

// Helper to find a value across various column naming conventions and casings
function extractKeyFromRow(row: Record<string, any>, candidateKeywords: string[]): string {
  if (!row || typeof row !== "object") return "";
  const entries = Object.entries(row);

  for (const [key, val] of entries) {
    const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const cand of candidateKeywords) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanKey === cleanCand || cleanKey.includes(cleanCand)) {
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
    }
  }
  return "";
}

function ImportsContent() {
  const router = useRouter();
  const params = useParams();
  const eventId = (params?.eventId as string) || "ev-1";
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTeamColumn, setSelectedTeamColumn] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const loadSampleDataset = () => {
    const sampleRows = [
      {
        "Team Name": "team -001",
        "Full Name": "Aarav Sharma",
        Email: "aarav.s@college.edu",
        "Mobile Number": "+1 (555) 111-2222",
        Course: "Computer Science",
        "Year of Study": "3rd Year",
        "Is Leader": "Yes",
      },
      {
        "Team Name": "team -001",
        "Full Name": "Ishaan Patel",
        Email: "ishaan.p@college.edu",
        "Mobile Number": "+1 (555) 111-2223",
        Course: "Computer Science",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -001",
        "Full Name": "Kavya Singh",
        Email: "kavya.s@college.edu",
        "Mobile Number": "+1 (555) 111-2224",
        Course: "Computer Science",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -001",
        "Full Name": "Aditya Rao",
        Email: "aditya.r@college.edu",
        "Mobile Number": "+1 (555) 111-2225",
        Course: "Computer Science",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -001",
        "Full Name": "Diya Nair",
        Email: "diya.n@college.edu",
        "Mobile Number": "+1 (555) 111-2226",
        Course: "Computer Science",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -002",
        "Full Name": "Arjun Das",
        Email: "arjun.d@college.edu",
        "Mobile Number": "+1 (555) 222-3331",
        Course: "Software Engineering",
        "Year of Study": "3rd Year",
        "Is Leader": "Yes",
      },
      {
        "Team Name": "team -002",
        "Full Name": "Sana Khan",
        Email: "sana.k@college.edu",
        "Mobile Number": "+1 (555) 222-3332",
        Course: "Software Engineering",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -002",
        "Full Name": "Neel Joshi",
        Email: "neel.j@college.edu",
        "Mobile Number": "+1 (555) 222-3333",
        Course: "Software Engineering",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
      {
        "Team Name": "team -002",
        "Full Name": "Tara Menon",
        Email: "tara.m@college.edu",
        "Mobile Number": "+1 (555) 222-3334",
        Course: "Software Engineering",
        "Year of Study": "3rd Year",
        "Is Leader": "No",
      },
    ];

    setPreviewData(sampleRows);
    setSelectedTeamColumn("Team Name");
    toast.success("Loaded tournament dataset: team -001 (5 members) and team -002 (4 members)");
  };

  const loadBulkDataset200 = () => {
    const bulkRows: any[] = [];
    const courses = ["Computer Science", "Cybersecurity", "Data Science", "Artificial Intelligence", "Robotics"];
    const tracks = ["Hackathon Track", "Cyber Defense", "Autonomous Systems", "E-Sports Bracket", "DevOps Cloud"];

    for (let t = 1; t <= 40; t++) {
      const teamNumber = String(t).padStart(3, "0");
      const teamName = `Squad Omega-${teamNumber}`;
      const course = courses[t % courses.length];
      const track = tracks[t % tracks.length];

      for (let p = 1; p <= 5; p++) {
        const isLeader = p === 1;
        bulkRows.push({
          "Team Name": teamName,
          "Full Name": isLeader ? `Captain Alex-${teamNumber}` : `Operative ${teamNumber}-${p}`,
          Email: isLeader ? `captain.omega${teamNumber}@campus.edu` : `member.${teamNumber}.${p}@campus.edu`,
          "Mobile Number": `+1 (555) ${100 + t}-${1000 + p}`,
          Course: course,
          Track: track,
          "Year of Study": `${((t + p) % 4) + 1}st Year`,
          "Is Leader": isLeader ? "Yes" : "No",
        });
      }
    }

    setPreviewData(bulkRows);
    setSelectedTeamColumn("Team Name");
    toast.success("Loaded 200+ Bulk Dataset: 40 distinct teams, 200 participants ready for batch import!");
  };

  const handlePreview = async () => {
    if (!file) return;

    setIsProcessing(true);
    const fileExtension = file.name.split(".").pop()?.toLowerCase();

    try {
      if (fileExtension === "csv" || fileExtension === "txt") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.data && results.data.length > 0) {
              setPreviewData(results.data);
              autoDetectTeamColumn(results.data);
              toast.success(`Successfully parsed ${results.data.length} rows.`);
            } else {
              toast.error("The file appears to be empty.");
            }
            setIsProcessing(false);
          },
          error: (error) => {
            toast.error("CSV Parse error: " + error.message);
            setIsProcessing(false);
          },
        });
        return;
      } else if (fileExtension === "xlsx" || fileExtension === "xls") {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const parsedData: any[] = XLSX.utils.sheet_to_json(worksheet);
        if (parsedData && parsedData.length > 0) {
          setPreviewData(parsedData);
          autoDetectTeamColumn(parsedData);
          toast.success(`Successfully parsed ${parsedData.length} records from Excel.`);
        } else {
          toast.error("No data rows found in Excel sheet.");
        }
      } else {
        throw new Error("Unsupported file format. Please upload .csv, .xlsx, or .xls file.");
      }
    } catch (err: any) {
      toast.error("File processing failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const autoDetectTeamColumn = (data: any[]) => {
    if (!data || data.length === 0) return;
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const teamKey = keys.find((k) => {
      const clean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      return clean.includes("team") || clean.includes("group") || clean.includes("squad");
    });
    if (teamKey) {
      setSelectedTeamColumn(teamKey);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || previewData.length === 0) return;

    setIsUploading(true);
    try {
      const response = await processRegistrationImport(eventId, previewData, selectedTeamColumn);

      if (response.success) {
        toast.success(response.message, { duration: 4000 });
        setPreviewData(null);
        setFile(null);
        setTimeout(() => {
          router.push(`/events/${eventId}/registrations`);
        }, 1200);
      } else {
        toast.error("Import failed: " + response.message);
      }
    } catch (err: any) {
      toast.error("An error occurred: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Compute segregated teams preview
  const segregatedSummary: Record<string, number> = {};
  if (previewData) {
    for (const row of previewData) {
      let tName = "";
      if (selectedTeamColumn && row[selectedTeamColumn]) {
        tName = String(row[selectedTeamColumn]).trim();
      }
      if (!tName) {
        tName = extractKeyFromRow(row, ["Team Name", "Team", "Team ID", "team_name", "team_id", "team"]);
      }
      if (!tName) {
        const pName = extractKeyFromRow(row, ["Full Name", "Name", "Participant Name", "name"]);
        tName = pName ? `Team - ${pName}` : "Individual Registration";
      }
      segregatedSummary[tName] = (segregatedSummary[tName] || 0) + 1;
    }
  }

  const distinctTeamList = Object.entries(segregatedSummary);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-sans font-bold text-slate-900 tracking-tight mb-1">Upload & Segregate Rosters</h1>
          <p className="text-slate-500 font-sans text-sm">
            Import Excel or CSV rosters. Participants are segregated team-wise, and a distinct, individual QR code is generated for each separate team.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={loadSampleDataset}
            className="text-slate-700 bg-white border-slate-300 hover:bg-slate-50 text-xs font-sans"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Sample (2 Teams)
          </Button>

          <Button
            onClick={loadBulkDataset200}
            className="bg-primary hover:bg-primary/90 text-white text-xs font-sans font-semibold shadow-xs"
          >
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Load 200+ Bulk Dataset (40 Teams)
          </Button>
        </div>
      </div>

      {!previewData ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-12 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <FileUp className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1 font-sans">
              Choose an Excel or CSV file
            </h3>
            <p className="text-sm text-slate-500 mb-6 font-sans text-center max-w-md">
              Supports .csv, .xlsx, .xls files with columns for <span className="font-semibold text-slate-700">Team Name</span> (or Team ID), <span className="font-semibold text-slate-700">Full Name</span>, and <span className="font-semibold text-slate-700">Email</span>.
            </p>

            <div className="w-full max-w-sm flex flex-col items-center gap-3">
              <Input
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                onChange={handleFileChange}
                className="bg-white border-slate-300 cursor-pointer text-sm"
              />

              <Button
                onClick={handlePreview}
                disabled={!file || isProcessing}
                className="bg-primary hover:bg-primary/90 text-white w-full h-10 font-sans font-medium"
              >
                {isProcessing ? "Reading Roster..." : "Preview & Validate Segregation"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col space-y-4">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/80">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Roster Parsed
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                  <Users className="w-3.5 h-3.5" />
                  {distinctTeamList.length} Distinct Teams Segregated
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                  <QrCode className="w-3.5 h-3.5" />
                  {distinctTeamList.length} Unique QR Passes
                </span>
              </div>
              <p className="text-xs text-slate-600 font-sans">
                Found <strong>{previewData.length} total participants</strong> distributed across <strong>{distinctTeamList.length} separate teams</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => setPreviewData(null)}
                disabled={isUploading}
                className="bg-white border-slate-300 font-sans text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={isUploading}
                className="bg-primary hover:bg-primary/90 text-white font-sans text-xs h-9 shadow-sm font-semibold"
              >
                {isUploading ? "Generating QR Passes..." : `Confirm & Import ${distinctTeamList.length} Separate Teams`}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </div>

          {/* TEAM SEGREGATION BREAKDOWN BOX */}
          <div className="px-6">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    Team-Wise Segregation Breakdown
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Each team listed below will be saved with its own distinct members and its own unique QR code pass.
                  </p>
                </div>

                {/* Team Column Selector */}
                {previewData[0] && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">Team Column:</span>
                    <select
                      value={selectedTeamColumn}
                      onChange={(e) => setSelectedTeamColumn(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800"
                    >
                      {Object.keys(previewData[0]).map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Grid of Segregated Teams */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {distinctTeamList.map(([teamName, memberCount], idx) => (
                  <div
                    key={idx}
                    className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-sans font-bold text-sm text-slate-900 tracking-tight">{teamName}</div>
                      <div className="text-[11px] text-slate-500">{memberCount} {memberCount === 1 ? "Member" : "Members"}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono font-semibold">
                      Distinct QR #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Raw Data Preview Table */}
          <div className="overflow-x-auto px-6 pb-6">
            <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Parsed Roster Data Preview (First 8 Rows)
            </h5>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200">
                    {Object.keys(previewData[0] || {}).slice(0, 6).map((key) => (
                      <TableHead key={key} className="font-sans font-medium text-slate-700 text-xs">
                        {key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 8).map((row, index) => (
                    <TableRow key={index} className="border-slate-100 hover:bg-slate-50/50">
                      {Object.values(row).slice(0, 6).map((val: any, i) => (
                        <TableCell key={i} className="font-sans text-slate-600 text-xs truncate max-w-[220px]">
                          {val === null || val === undefined ? "-" : String(val)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportsSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-pulse font-sans">
      <div className="h-16 bg-white border border-slate-200 rounded-xl p-4" />
      <div className="h-64 bg-white border border-slate-200 rounded-2xl p-6" />
    </div>
  );
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<ImportsSkeleton />}>
      <ImportsContent />
    </Suspense>
  );
}
