% ReadPhysionetData.m
% SeptiSense MATLAB Pipeline
% Reads PhysioNet Challenge 2017 single-lead ECG recordings from ml/data/raw/challenge-2017/training2017/
% and exports selected recordings or features to CSV/MAT format so Python and MATLAB workflows remain in sync.

function ReadPhysionetData()
    fprintf('=== SeptiSense MATLAB Ingest: PhysioNet 2017 ECG Data ===\n');
    
    scriptDir = fileparts(mfilename('fullpath'));
    baseDir = fullfile(scriptDir, '..', 'data', 'raw', 'challenge-2017');
    trainDir = fullfile(baseDir, 'training2017');
    refFile = fullfile(baseDir, 'REFERENCE-v3.csv');
    outDir = fullfile(scriptDir, '..', 'data', 'processed', 'matlab_ecg');
    
    if ~exist(trainDir, 'dir')
        error('Data folder not found: %s. Run python3 ml/download_dataset.py first.', trainDir);
    end
    
    if ~exist(outDir, 'dir')
        mkdir(outDir);
    end
    
    % Read Reference Labels
    fprintf('Loading reference labels from: %s\n', refFile);
    refData = readtable(refFile, 'ReadVariableNames', false);
    refData.Properties.VariableNames = {'RecordName', 'Class'};
    
    numRecords = height(refData);
    fprintf('Total records in reference: %d\n', numRecords);
    
    % Export a standardized sample of 100 recordings to CSV for cross-verification
    exportLimit = min(100, numRecords);
    fprintf('Exporting first %d recordings to %s...\n', exportLimit, outDir);
    
    manifestTable = table();
    
    for i = 1:exportLimit
        recName = refData.RecordName{i};
        recClass = refData.Class{i};
        matFilePath = fullfile(trainDir, [recName '.mat']);
        
        if exist(matFilePath, 'file')
            data = load(matFilePath);
            val = data.val; % Signal in raw ADC or microvolts
            fs = 300; % PhysioNet 2017 ECG sampling frequency is 300 Hz
            durationSec = length(val) / fs;
            
            % Save signal array to CSV
            csvOutPath = fullfile(outDir, [recName '.csv']);
            writematrix(val', csvOutPath);
            
            manifestTable = [manifestTable; table({recName}, {recClass}, length(val), fs, durationSec, ...
                'VariableNames', {'RecordName', 'Class', 'NumSamples', 'SamplingRate', 'DurationSec'})];
        end
    end
    
    manifestOut = fullfile(outDir, 'matlab_exported_manifest.csv');
    writetable(manifestTable, manifestOut);
    fprintf('Successfully exported %d records. Manifest saved to %s\n', height(manifestTable), manifestOut);
end
