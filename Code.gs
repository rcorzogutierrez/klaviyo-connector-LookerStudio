// Configuración del conector
var cc = DataStudioApp.createCommunityConnector();

// URL base de la API de Klaviyo
var API_BASE_URL = 'https://a.klaviyo.com/api';

// ============================================
// FUNCIONES DE AUTENTICACIÓN
// ============================================

function getAuthType() {
  return cc.newAuthTypeResponse()
    .setAuthType(cc.AuthType.KEY)
    .build();
}

function resetAuth() {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.deleteProperty('dscc.klaviyo.apiKey');
}

function isAuthValid() {
  var apiKey = PropertiesService.getUserProperties().getProperty('dscc.klaviyo.apiKey');
  if (!apiKey) {
    return false;
  }
  
  var url = API_BASE_URL + "/campaigns?filter=equals(messages.channel,'email')";
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey.trim(),
      'Accept': 'application/json',
      'revision': '2024-10-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    return response.getResponseCode() === 200;
  } catch (e) {
    console.error('Auth validation error:', e.toString());
    return false;
  }
}

function setCredentials(request) {
  if (!request.key || request.key.trim() === '') {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  
  var apiKey = request.key.trim();
  
  if (!apiKey.startsWith('pk_')) {
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
  
  var url = API_BASE_URL + "/campaigns?filter=equals(messages.channel,'email')";
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey,
      'Accept': 'application/json',
      'revision': '2024-10-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      PropertiesService.getUserProperties().setProperty('dscc.klaviyo.apiKey', apiKey);
      return {
        errorCode: 'NONE'
      };
    } else {
      return {
        errorCode: 'INVALID_CREDENTIALS'
      };
    }
  } catch (e) {
    console.error('Error validating credentials:', e.toString());
    return {
      errorCode: 'INVALID_CREDENTIALS'
    };
  }
}

// ============================================
// CONFIGURACIÓN Y ESQUEMA
// ============================================

function getConfig() {
  var config = cc.getConfig();
  
  config.newInfo()
    .setId('instructions')
    .setText('Conector para obtener datos de campañas de email de Klaviyo.');
  
  config.setDateRangeRequired(false);
  
  return config.build();
}

function getSchema(request) {
  var fields = cc.getFields();
  var types = cc.FieldType;
  
  // Dimensiones
  fields.newDimension()
    .setId('campaign_id')
    .setName('Campaign ID')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('campaign_name')
    .setName('Campaign Name')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('status')
    .setName('Status')
    .setType(types.TEXT);
  
  fields.newDimension()
    .setId('created_at')
    .setName('Created Date')
    .setType(types.YEAR_MONTH_DAY);
  
  fields.newDimension()
    .setId('updated_at')
    .setName('Updated Date')
    .setType(types.YEAR_MONTH_DAY);
  
  fields.newDimension()
    .setId('send_time')
    .setName('Send Time')
    .setType(types.YEAR_MONTH_DAY_HOUR);
  
  return {
    'schema': fields.build()
  };
}

// ============================================
// OBTENCIÓN DE DATOS
// ============================================

function getData(request) {
  console.log('====== INICIO getData ======');
  
  var apiKey = PropertiesService.getUserProperties().getProperty('dscc.klaviyo.apiKey');
  
  if (!apiKey) {
    cc.newUserError()
      .setText('API Key no configurada. Por favor, vuelve a autenticarte.')
      .throwException();
  }
  
  var url = "https://a.klaviyo.com/api/campaigns?filter=equals(messages.channel,'email')&fields[campaign]=name,status,created_at,updated_at,send_time";
  
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey,
      'Accept': 'application/json',
      'revision': '2024-10-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() !== 200) {
      console.error('Error - Status:', response.getResponseCode());
      // IMPORTANTE: Crear schema vacío pero con la estructura correcta
      var emptySchema = [];
      request.fields.forEach(function(field) {
        emptySchema.push({
          name: field.name,
          dataType: field.dataType || 'STRING'
        });
      });
      return {
        schema: emptySchema,
        rows: []
      };
    }
    
    var json = JSON.parse(response.getContentText());
    
    if (!json.data || !Array.isArray(json.data)) {
      console.error('No data found');
      var emptySchema = [];
      request.fields.forEach(function(field) {
        emptySchema.push({
          name: field.name,
          dataType: field.dataType || 'STRING'
        });
      });
      return {
        schema: emptySchema,
        rows: []
      };
    }
    
    console.log('Campañas obtenidas:', json.data.length);
    console.log('Campos solicitados:', request.fields.map(function(f) { return f.name; }).join(', '));
    
    // CREAR SCHEMA CON LA ESTRUCTURA CORRECTA
    var schema = [];
    request.fields.forEach(function(field) {
      schema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    
    // Mapear datos
    var rows = [];
    
    json.data.forEach(function(campaign) {
      var values = [];
      
      request.fields.forEach(function(requestedField) {
        var value = '';
        
        switch (requestedField.name) {
          case 'campaign_id':
            value = campaign.id || '';
            break;
            
          case 'campaign_name':
            value = (campaign.attributes && campaign.attributes.name) ? campaign.attributes.name : '';
            break;
            
          case 'status':
            value = (campaign.attributes && campaign.attributes.status) ? campaign.attributes.status : '';
            break;
            
          case 'created_at':
            if (campaign.attributes && campaign.attributes.created_at) {
              try {
                var date = new Date(campaign.attributes.created_at);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          case 'updated_at':
            if (campaign.attributes && campaign.attributes.updated_at) {
              try {
                var date = new Date(campaign.attributes.updated_at);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          case 'send_time':
            if (campaign.attributes && campaign.attributes.send_time) {
              try {
                var date = new Date(campaign.attributes.send_time);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMddHH');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          default:
            value = '';
            break;
        }
        
        values.push(value);
      });
      
      rows.push({
        values: values
      });
    });
    
    console.log('Filas creadas:', rows.length);
    console.log('Primera fila:', JSON.stringify(rows[0]));
    console.log('Schema retornado:', JSON.stringify(schema));
    
    // Retorno con schema estructurado correctamente
    var result = {
      schema: schema,
      rows: rows
    };
    
    console.log('Resultado final (primeros 500 chars):', JSON.stringify(result).substring(0, 500));
    
    return result;
    
  } catch (e) {
    console.error('Error en getData:', e.toString());
    
    // En caso de error, retornar estructura válida
    var errorSchema = [];
    request.fields.forEach(function(field) {
      errorSchema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    
    return {
      schema: errorSchema,
      rows: []
    };
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
  } catch (e) {
    console.error('Error formatting date:', e.toString());
    return '';
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  try {
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, 'GMT', 'yyyyMMddHH');
  } catch (e) {
    console.error('Error formatting datetime:', e.toString());
    return '';
  }
}

// ============================================
// FUNCIÓN REQUERIDA POR LOOKER STUDIO
// ============================================

function isAdminUser() {
  return false;
}
