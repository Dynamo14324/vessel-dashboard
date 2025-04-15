/**
 * This file enhances the vessel dashboard by integrating the data processing functions
 * with the visualization components to ensure proper data handling and display.
 */

// Function to integrate Excel parsing with Chart.js visualization
function integrateExcelProcessing() {
    // Modify the parseExcelFile function to use the actual data processing functions
    window.parseExcelFile = function(arrayBuffer, vesselName) {
        try {
            // Use SheetJS to parse Excel file
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), {type: 'array'});
            
            // Get first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON
            let data = XLSX.utils.sheet_to_json(worksheet);
            
            // Add vessel name to each record
            data = data.map(item => ({
                ...item,
                VESSEL_NAME: vesselName
            }));
            
            // Process data using our data processing functions
            data = processData(data);
            
            return data;
        } catch (error) {
            console.error("Error parsing Excel file:", error);
            throw error;
        }
    };
    
    // Clean data by removing NaN columns
    window.cleanData = function(data) {
        if (!data || data.length === 0) return [];
        
        // Get all columns
        const columns = Object.keys(data[0]);
        
        // Find columns with all NaN values
        const nanColumns = columns.filter(col => {
            return data.every(row => {
                const value = row[col];
                return value === null || value === undefined || 
                       (typeof value === 'number' && isNaN(value)) ||
                       value === '';
            });
        });
        
        // Remove NaN columns from data
        return data.map(row => {
            const newRow = {...row};
            nanColumns.forEach(col => {
                delete newRow[col];
            });
            return newRow;
        });
    };
    
    // Create timestamp from DATE and TIME columns
    window.createTimestamp = function(data) {
        return data.map(row => {
            const newRow = {...row};
            
            if (row.DATE && row.TIME) {
                // Handle different date formats
                let dateObj;
                if (row.DATE instanceof Date) {
                    dateObj = row.DATE;
                } else if (typeof row.DATE === 'string') {
                    dateObj = new Date(row.DATE);
                } else if (typeof row.DATE === 'number') {
                    // Excel date number
                    dateObj = new Date(Math.round((row.DATE - 25569) * 86400 * 1000));
                }
                
                if (dateObj && !isNaN(dateObj.getTime())) {
                    // Format time
                    let timeStr = row.TIME;
                    if (typeof timeStr === 'number') {
                        // Convert Excel time number to string
                        const hours = Math.floor(timeStr * 24);
                        const minutes = Math.floor((timeStr * 24 * 60) % 60);
                        const seconds = Math.floor((timeStr * 24 * 60 * 60) % 60);
                        timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                    
                    // Create timestamp
                    const dateStr = dateObj.toISOString().split('T')[0];
                    newRow.TIMESTAMP = new Date(`${dateStr}T${timeStr}`);
                }
            }
            
            return newRow;
        });
    };
    
    // Process data
    window.processData = function(data) {
        // Clean data
        data = cleanData(data);
        
        // Create timestamp
        data = createTimestamp(data);
        
        // Sort by timestamp
        if (data.length > 0 && data[0].TIMESTAMP) {
            data.sort((a, b) => {
                if (!a.TIMESTAMP) return 1;
                if (!b.TIMESTAMP) return -1;
                return a.TIMESTAMP - b.TIMESTAMP;
            });
        }
        
        return data;
    };
}

// Function to enhance chart rendering with proper data handling
function enhanceChartRendering() {
    // Enhance vibration trends chart
    window.createVibrationTrendsChart = function() {
        const ctx = document.getElementById('vibrationTrendsChart').getContext('2d');
        
        // Check if data exists
        if (!filteredData || filteredData.length === 0) {
            // Create empty chart with message
            charts.vibrationTrends = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'No data available for vibration trends'
                        }
                    }
                }
            });
            return;
        }
        
        // Group data by date and vessel
        const groupedData = {};
        
        // Find the vibration column to use
        const vibrationColumns = [
            'Vel, Rms (RMS)', 
            'Vib_H', 
            'Vib_V', 
            'Vib_A'
        ];
        
        let selectedVibColumn = null;
        for (const col of vibrationColumns) {
            if (filteredData.some(item => item[col] !== undefined && item[col] !== null)) {
                selectedVibColumn = col;
                break;
            }
        }
        
        if (!selectedVibColumn) {
            // No vibration data found
            charts.vibrationTrends = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'No vibration data available in the dataset'
                        }
                    }
                }
            });
            return;
        }
        
        // Group data
        filteredData.forEach(item => {
            if (!item.TIMESTAMP || !item[selectedVibColumn]) return;
            
            const date = new Date(item.TIMESTAMP).toLocaleDateString();
            const vessel = item.VESSEL_NAME || 'Unknown';
            
            if (!groupedData[vessel]) {
                groupedData[vessel] = {};
            }
            
            if (!groupedData[vessel][date]) {
                groupedData[vessel][date] = [];
            }
            
            groupedData[vessel][date].push(parseFloat(item[selectedVibColumn]) || 0);
        });
        
        // Calculate average for each date and vessel
        const datasets = [];
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'];
        
        let colorIndex = 0;
        const allDates = new Set();
        
        for (const vessel in groupedData) {
            const data = [];
            const dates = [];
            
            for (const date in groupedData[vessel]) {
                const values = groupedData[vessel][date];
                const average = values.reduce((sum, value) => sum + value, 0) / values.length;
                
                data.push({
                    date: date,
                    value: average
                });
                
                allDates.add(date);
            }
            
            // Sort by date
            data.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            datasets.push({
                label: vessel,
                data: data.map(item => item.value),
                borderColor: colors[colorIndex % colors.length],
                backgroundColor: colors[colorIndex % colors.length] + '20',
                tension: 0.4,
                fill: true
            });
            
            colorIndex++;
        }
        
        // Get sorted array of all dates
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
        
        // Create chart
        charts.vibrationTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Average ${selectedVibColumn} Over Time`
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: selectedVibColumn
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    };
}

// Function to improve data export functionality
function enhanceDataExport() {
    // Enhance CSV export
    window.exportCSV = function(data, filename) {
        // Ensure data is properly formatted
        const formattedData = data.map(item => {
            const newItem = {...item};
            
            // Format dates
            if (newItem.DATE instanceof Date) {
                newItem.DATE = newItem.DATE.toISOString().split('T')[0];
            }
            
            if (newItem.TIMESTAMP instanceof Date) {
                newItem.TIMESTAMP = newItem.TIMESTAMP.toISOString();
            }
            
            return newItem;
        });
        
        // Convert data to CSV
        const csv = Papa.unparse(formattedData);
        
        // Create blob
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        
        // Download file
        saveAs(blob, `${filename}.csv`);
    };
    
    // Enhance Excel export
    window.exportExcel = function(data, filename) {
        // Ensure data is properly formatted
        const formattedData = data.map(item => {
            const newItem = {...item};
            
            // Format dates
            if (newItem.DATE instanceof Date) {
                newItem.DATE = newItem.DATE.toISOString().split('T')[0];
            }
            
            if (newItem.TIMESTAMP instanceof Date) {
                newItem.TIMESTAMP = newItem.TIMESTAMP.toISOString();
            }
            
            return newItem;
        });
        
        // Create workbook
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Vessel Data");
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        // Create blob
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Download file
        saveAs(blob, `${filename}.xlsx`);
    };
}

// Function to add SheetJS library for Excel handling
function addSheetJSLibrary() {
    // Create script element
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    
    // Add to document
    document.head.appendChild(script);
    
    // Return promise that resolves when script is loaded
    return new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
    });
}

// Initialize integration when document is loaded
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Add SheetJS library
        await addSheetJSLibrary();
        
        // Integrate Excel processing
        integrateExcelProcessing();
        
        // Enhance chart rendering
        enhanceChartRendering();
        
        // Enhance data export
        enhanceDataExport();
        
        console.log('Visualization integration complete');
    } catch (error) {
        console.error('Error integrating visualization:', error);
    }
});
