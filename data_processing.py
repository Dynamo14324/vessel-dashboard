import pandas as pd
import numpy as np
import os
import json
from datetime import datetime
import base64
import io

def load_excel_file(file_content, filename):
    """
    Load Excel file from uploaded content
    
    Args:
        file_content: The content of the uploaded file
        filename: The name of the file
        
    Returns:
        DataFrame: Pandas DataFrame with the Excel data
        str: Vessel name extracted from filename
    """
    try:
        # Extract vessel name from filename
        vessel_name = os.path.basename(filename).split(' CBM')[0]
        
        # Read Excel file from content
        df = pd.read_excel(io.BytesIO(file_content))
        
        # Add vessel name as a column
        df['VESSEL_NAME'] = vessel_name
        
        return df, vessel_name
    except Exception as e:
        raise Exception(f"Error loading file {filename}: {str(e)}")

def clean_data(df):
    """
    Clean the data by removing columns with all NaN values and handling other issues
    
    Args:
        df: Pandas DataFrame to clean
        
    Returns:
        DataFrame: Cleaned DataFrame
    """
    # Remove columns where all values are NaN
    df = df.dropna(axis=1, how='all')
    
    # For remaining columns, replace NaN with appropriate values based on column type
    for col in df.columns:
        if df[col].dtype == 'float64' or df[col].dtype == 'int64':
            # Replace NaN with 0 for numeric columns
            df[col] = df[col].fillna(0)
        else:
            # Replace NaN with empty string for non-numeric columns
            df[col] = df[col].fillna('')
    
    return df

def create_timestamp(df):
    """
    Create a timestamp column by combining DATE and TIME columns
    
    Args:
        df: Pandas DataFrame with DATE and TIME columns
        
    Returns:
        DataFrame: DataFrame with new TIMESTAMP column
    """
    if 'DATE' in df.columns and 'TIME' in df.columns:
        # Convert TIME column to string if it's not already
        df['TIME'] = df['TIME'].astype(str)
        
        # Create timestamp by combining DATE and TIME
        df['TIMESTAMP'] = pd.to_datetime(df['DATE'].dt.strftime('%Y-%m-%d') + ' ' + df['TIME'], 
                                         errors='coerce')
    
    return df

def process_data(df):
    """
    Process the data for analysis
    
    Args:
        df: Pandas DataFrame to process
        
    Returns:
        DataFrame: Processed DataFrame
    """
    # Clean the data
    df = clean_data(df)
    
    # Create timestamp
    df = create_timestamp(df)
    
    # Sort by timestamp
    if 'TIMESTAMP' in df.columns:
        df = df.sort_values('TIMESTAMP')
    
    return df

def merge_dataframes(dfs):
    """
    Merge multiple DataFrames into one
    
    Args:
        dfs: List of DataFrames to merge
        
    Returns:
        DataFrame: Merged DataFrame
    """
    if not dfs:
        return pd.DataFrame()
    
    # Concatenate all dataframes
    merged_df = pd.concat(dfs, ignore_index=True)
    
    return merged_df

def get_summary_stats(df):
    """
    Get summary statistics for the data
    
    Args:
        df: Pandas DataFrame
        
    Returns:
        dict: Dictionary with summary statistics
    """
    stats = {}
    
    # Get vessel names and counts
    if 'VESSEL_NAME' in df.columns:
        stats['vessel_counts'] = df['VESSEL_NAME'].value_counts().to_dict()
    
    # Get component counts
    if 'COMP_NAME' in df.columns:
        stats['component_counts'] = df['COMP_NAME'].value_counts().to_dict()
    
    # Get MP name counts
    if 'MP_NAME' in df.columns:
        stats['mp_name_counts'] = df['MP_NAME'].value_counts().to_dict()
    
    # Get date range
    if 'TIMESTAMP' in df.columns:
        stats['date_range'] = {
            'min': df['TIMESTAMP'].min().isoformat() if not pd.isna(df['TIMESTAMP'].min()) else None,
            'max': df['TIMESTAMP'].max().isoformat() if not pd.isna(df['TIMESTAMP'].max()) else None
        }
    
    # Get numeric column statistics
    numeric_cols = df.select_dtypes(include=['float64', 'int64']).columns.tolist()
    stats['numeric_stats'] = {}
    
    for col in numeric_cols:
        if col not in ['COMP_NUMBER']:  # Skip certain columns
            stats['numeric_stats'][col] = {
                'min': float(df[col].min()) if not pd.isna(df[col].min()) else 0,
                'max': float(df[col].max()) if not pd.isna(df[col].max()) else 0,
                'mean': float(df[col].mean()) if not pd.isna(df[col].mean()) else 0,
                'median': float(df[col].median()) if not pd.isna(df[col].median()) else 0
            }
    
    return stats

def filter_data(df, filters):
    """
    Filter the data based on provided filters
    
    Args:
        df: Pandas DataFrame to filter
        filters: Dictionary with filter criteria
        
    Returns:
        DataFrame: Filtered DataFrame
    """
    filtered_df = df.copy()
    
    # Apply filters
    for column, values in filters.items():
        if column in filtered_df.columns and values:
            if isinstance(values, list):
                filtered_df = filtered_df[filtered_df[column].isin(values)]
            else:
                filtered_df = filtered_df[filtered_df[column] == values]
    
    return filtered_df

def get_time_series_data(df, column, group_by='VESSEL_NAME'):
    """
    Get time series data for a specific column
    
    Args:
        df: Pandas DataFrame
        column: Column to get time series data for
        group_by: Column to group by (default: VESSEL_NAME)
        
    Returns:
        dict: Dictionary with time series data
    """
    if 'TIMESTAMP' not in df.columns or column not in df.columns:
        return {}
    
    # Group by timestamp and the group_by column
    if group_by in df.columns:
        grouped = df.groupby([pd.Grouper(key='TIMESTAMP', freq='D'), group_by])[column].mean().reset_index()
        
        # Create a dictionary with time series data for each group
        result = {}
        for group in grouped[group_by].unique():
            group_data = grouped[grouped[group_by] == group]
            result[group] = {
                'timestamps': group_data['TIMESTAMP'].dt.strftime('%Y-%m-%d').tolist(),
                'values': group_data[column].tolist()
            }
        
        return result
    else:
        # If group_by column doesn't exist, group only by timestamp
        grouped = df.groupby(pd.Grouper(key='TIMESTAMP', freq='D'))[column].mean().reset_index()
        return {
            'all': {
                'timestamps': grouped['TIMESTAMP'].dt.strftime('%Y-%m-%d').tolist(),
                'values': grouped[column].tolist()
            }
        }

def get_correlation_data(df, columns):
    """
    Get correlation data for specified columns
    
    Args:
        df: Pandas DataFrame
        columns: List of columns to calculate correlations for
        
    Returns:
        dict: Dictionary with correlation data
    """
    # Filter to only include numeric columns from the provided list
    numeric_df = df[columns].select_dtypes(include=['float64', 'int64'])
    
    if numeric_df.empty:
        return {}
    
    # Calculate correlation matrix
    corr_matrix = numeric_df.corr().round(2)
    
    # Convert to dictionary format
    corr_data = {}
    for col in corr_matrix.columns:
        corr_data[col] = corr_matrix[col].to_dict()
    
    return corr_data

def dataframe_to_json(df):
    """
    Convert DataFrame to JSON with proper handling of datetime objects
    
    Args:
        df: Pandas DataFrame
        
    Returns:
        str: JSON string
    """
    return df.to_json(orient='records', date_format='iso')

def dataframe_to_csv(df):
    """
    Convert DataFrame to CSV
    
    Args:
        df: Pandas DataFrame
        
    Returns:
        str: CSV string
    """
    return df.to_csv(index=False)

def dataframe_to_excel(df):
    """
    Convert DataFrame to Excel
    
    Args:
        df: Pandas DataFrame
        
    Returns:
        bytes: Excel file content as bytes
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    
    return output.getvalue()

def get_column_categories(df):
    """
    Categorize columns by type for easier filtering and visualization
    
    Args:
        df: Pandas DataFrame
        
    Returns:
        dict: Dictionary with column categories
    """
    categories = {
        'metadata': ['MP_NUMBER', 'MP_NAME', 'COMP_NUMBER', 'COMP_NAME', 'VESSEL_NAME', 'DATE', 'TIME', 'TIMESTAMP'],
        'vibration': [col for col in df.columns if 'Vib' in col or 'Vel' in col or 'Acc' in col or 'Disp' in col],
        'bearing': [col for col in df.columns if 'Bearing' in col or 'Cuscinetto' in col],
        'shaft': [col for col in df.columns if 'Shaft' in col],
        'other': []
    }
    
    # Add remaining columns to 'other' category
    all_categorized = sum(categories.values(), [])
    categories['other'] = [col for col in df.columns if col not in all_categorized]
    
    return categories
