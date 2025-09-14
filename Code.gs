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

  fields.newDimension()
  .setId('subject')
  .setName('Subject')
  .setType(types.TEXT);

  fields.newDimension()
    .setId('preview_text')
    .setName('Preview Text')
    .setType(types.TEXT);  
  
  return {
    'schema': fields.build()
  };
}

// ============================================
// OBTENCIÓN DE DATOS
// ============================================

function getData(request) {
  var apiKey = PropertiesService.getUserProperties().getProperty('dscc.klaviyo.apiKey');
  
  if (!apiKey) {
    cc.newUserError()
      .setText('API Key no configurada. Por favor, vuelve a autenticarte.')
      .throwException();
  }
  
  var url = "https://a.klaviyo.com/api/campaigns?filter=equals(messages.channel,'email')&fields[campaign]=name,status,created_at,updated_at,send_time&fields[campaign-message]=definition.content.subject,definition.content.preview_text&include=campaign-messages";
  
  var options = {
    'method': 'GET',
    'headers': {
      'Authorization': 'Klaviyo-API-Key ' + apiKey,
      'Accept': 'application/json',
      'revision': '2025-07-15'
    },
    'muteHttpExceptions': true
  };
  
  try {
    var allCampaigns = [];
    var allIncluded = [];
    var currentUrl = url;
    var pageCount = 0;
    var maxPages = 10;

    while (currentUrl && pageCount < maxPages) {
      var response = UrlFetchApp.fetch(currentUrl, options);
      if (response.getResponseCode() !== 200) break;
      var json = JSON.parse(response.getContentText());
      allCampaigns = allCampaigns.concat(json.data);
      if (json.included) allIncluded = allIncluded.concat(json.included); // Acumular included
      currentUrl = json.links && json.links.next ? json.links.next : null;
      pageCount++;
    }

    if (allCampaigns.length === 0) {
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

    var schema = [];
    request.fields.forEach(function(field) {
      schema.push({
        name: field.name,
        dataType: field.dataType || 'STRING'
      });
    });
    
    var rows = [];
    
    allCampaigns.forEach(function(campaign) {
      var values = [];
      
      var message = null;
      if (campaign.relationships && campaign.relationships['campaign-messages'] && campaign.relationships['campaign-messages'].data && allIncluded.length > 0) {
        var messageId = campaign.relationships['campaign-messages'].data[0].id;
        message = allIncluded.find(function(item) {
          return item.id === messageId && item.type === 'campaign-message';
        });
      }
      
      request.fields.forEach(function(requestedField) {
        var value = '';
        
        switch (requestedField.name) {
          case 'campaign_id':
            value = campaign.id || '';
            break;
            
          case 'campaign_name':
            value = campaign.attributes.name || '';
            break;
            
          case 'status':
            value = campaign.attributes.status || '';
            break;
            
          case 'created_at':
            if (campaign.attributes.created_at) {
              try {
                var date = new Date(campaign.attributes.created_at);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          case 'updated_at':
            if (campaign.attributes.updated_at) {
              try {
                var date = new Date(campaign.attributes.updated_at);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMdd');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          case 'send_time':
            if (campaign.attributes.send_time) {
              try {
                var date = new Date(campaign.attributes.send_time);
                value = Utilities.formatDate(date, 'GMT', 'yyyyMMddHH');
              } catch(e) {
                value = '';
              }
            }
            break;
            
          case 'subject':
            value = (message && message.attributes && message.attributes.definition && message.attributes.definition.content && message.attributes.definition.content.subject) ? message.attributes.definition.content.subject : '';
            break;
            
          case 'preview_text':
            value = (message && message.attributes && message.attributes.definition && message.attributes.definition.content && message.attributes.definition.content.preview_text) ? message.attributes.definition.content.preview_text : '';
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
    
    var result = {
      schema: schema,
      rows: rows
    };
    
    return result;
    
  } catch (e) {
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
