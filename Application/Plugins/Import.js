
var lines, filename;
var verticies, polygons, smd_tris, nodes, triangles_verts, skeleton, mesh, deformers_list, mat_clusters;
var oRoot, oModel;
var mat_dir = "";

function Main(args) // , model_name, parent
{
	if (args == null) 
	{
		logmessage("Main() input arguments is null.", siError);
		retrun false;
	}
	
	var args = args.split("#");
	
	if (args.length == 0) 
	{
		logmessage("Main() input arguments count = zero.", siError);
		retrun false;
	}

	//  get arguments (file_path, model_name, parent)
	var file_path = args[0];
	var name = file_path.replace(/^.*[\\\/]/, '').split('.')[0];
	var model_name = args[1];
	var parent = args[2];

	oRoot = Application.ActiveProject.ActiveScene.Root;

	if(parent != "")
	{
		parent = oRoot.FindChild(parent);
	}
	

	if(model_name!= "") { name = model_name; }

	// var start_total =  0.001 * new Date();

	init_vars();
	
	lines = readfile(file_path).split('\n');

	//  if no material directory is specified, set it to the smd model directory
	if(mat_dir == "") { mat_dir = get_FileDir(file_path); } //  model directory }
	
	//  if parent is defined, otherwise create the model under the scene's root
	if(parent != "")
	{
		oModel = parent.AddModel(null, name);
	} 
	else 
	{
		oModel = oRoot.AddModel(null, name);
	}
	
	parse_smd_text();
	build_mesh();
	build_rig();
	import_normals();
	import_UVs();
	import_envelope();
	create_MatClusters();

	// var elapse_total = 0.001 * new Date() - start_total;  
	// logmessage("SMD Import time: " + XSIRound(elapse_total, 3) + " seconds" );		
	
	
	return true;
}

// reset variables
function init_vars()
{
	filename = "";
	mat_dir = "";
	lines = null; 

	verticies = new Array();
	polygons = new Array();
	smd_tris = new Array(); // vertex data but without the duplicate verticies (which the original triangulated smd has)
	nodes = new Array();
	triangles_verts = new Array();
	skeleton = new Array();
	
	mat_clusters = new Array();

	oRoot = Application.ActiveProject.ActiveScene.Root;
	oModel = null;
	mesh = null;
	deformers_list = new ActiveXObject("XSI.Collection");
}

function create_MatClusters()
{
	// REBUILD CLUSTERS
	var oGeo = mesh.ActivePrimitive.Geometry;
	var poly_count = oGeo.Facets.Count;
	var cls_end = poly_count -1;
	
	// loop in reverse to get cluster sizes and create them
	var i =  mat_clusters.length; while (i--) 
	{
		var cls_name = mat_clusters[i].name;
		var cls_start = mat_clusters[i].poly -1;
		var cls_slection = new Array();

		//for ( var p = cls_end-1; p > cls_start-1 ; p-- )
		for ( var p = cls_end; p > cls_start; p-- )
		{
			cls_slection.push(p);
		}
		oGeo.AddCluster(siPolygonCluster, cls_name, cls_slection); // siVertexCluster
		cls_end = cls_start;
	}

	// IMPORT/ASSIGN MATERIALS
	var oCls = mesh.ActivePrimitive.Geometry.Clusters;
	var first_material = true;
	
	// for each cluster
	for ( var c = 0 ; c < oCls.count ; c++ )
	{
		var cls = oCls(c);
		if(cls.Type == "poly")
		{	
			// search material by name
			var oMaterial = get_material(cls.Name);
			
			// if the material exists in the Mat libs, assign existing material to the cluster
			if(oMaterial != null)
			{
				CopyPaste(oMaterial, null, cls, 0);
			} 
			else // create material, import texture & apply to cluster
			{
				// create and add material to cluster
				oMaterial = cls.AddMaterial("Phong", siBranch, cls.Name);

				// load texture as ImageClip
				var oClip = CreateImageClip(mat_dir + cls.Name + ".tga");

				// Connect ImageClip to diffuse
				oMaterial.Shaders(0).diffuse.Connect(oClip);
				// assign material to cluster
				CopyPaste(oMaterial, null, cls, 0);
			}
			
			// if its the first cluster/material
			// we assign it to the mesh object so that it removes the "Scene_Material" from it
			if(first_material)
			{
				CopyPaste(oMaterial, null, mesh.FullName, 0);
				first_material = false;
			}
			
		}
	}
	
}

// searches material by name, if found returns the material object
function get_material(mat_name)
{
	var mat_exists = false;
	var material = null;
	
	var oMatLibs = Application.ActiveProject.ActiveScene.MaterialLibraries;

	for ( var l = 0 ; l < oMatLibs.count ; l++ )
	{
		var oMatLib = oMatLibs.Item(l);
		
		for ( var i = 0; i < oMatLib.Items.count; i++ )
		{
			var oMat = oMatLib.Items(i);
			if(mat_name == oMat.Name)
			{
				mat_exists = true;
				material = oMat;
				break;
			}
		}
		
		if(mat_exists) { break; }
	}

	return material;
}

function parse_smd_text()
{
	// clean strings (we have to do it in a separate loop because if its cleaned in the same loop
	// some lines strings cannot be found, maybe it doesn't update the array within the same loop in xsi
	// while loop is faster than "for loop" for this operation
	var i = lines.length; while (i--) 
	{
	  lines[i] = lines[i].replace(/^\s*|\s(?=\s)|\s*$/g, "");
	}

	// loop searching elements
	for ( var i = 0 ; i <  lines.length; i++ ) // lines.length
	{
	
	  // reaplce doesn't work in this case! hence previous loop to do the replace cleanup
	  // var line =  String(lines[i].replace(/^\s*|\s(?=\s)|\s*$/g, ""));
	  
		var line = lines[i];
		// line = line.replace(/^\s*|\s(?=\s)|\s*$/g, "");
		
		if(line == "nodes") // find triangles line
		{
			for(var n = i + 1; n < lines.length; n++) // lines.length -4
			{
			if (lines[n] == "end") {break;}
				Node = new node(lines[n]);
				nodes.push(Node);	
			}
		}
		
		if(line == "skeleton") // find triangles line
		{
			skeleton_list = new skeletonT(); // skeletonT

			for ( var n = i + 2; n < lines.length; n++)
			{
			 var linen = lines[n];
			
				if (linen == "end") { skeleton.push(skeleton_list); break;}
				
				if (linen.substring(0, 4) == "time") 
				{ 
					skeleton.push(skeleton_list); 
					skeleton_list = new skeletonT(); 
				} 
				else if (linen.substring(0, 4) != "time") 
				{
					Node = new skeleton_node(lines[n]);
					skeleton_list.Nodes.push(Node);
				}
			}	
		}
		

		if(line == "triangles") // find triangles line
		{
		var tris_length = lines.length -4;
			// loop starting from "triangles" line +1
			for ( var t = i + 1 ; t < tris_length; t+=4) // lines.length -4
			{
			
			
					var tri_index = polygons.length;
					var mat_name = lines[t];
					var vertex1 = new SMD_Tri(lines[t + 1]);
					var vertex2 = new SMD_Tri(lines[t + 2]);
					var vertex3 = new SMD_Tri(lines[t + 3]);
					
					polygons.push(3);
					
					to_polymsh(vertex1);
					to_polymsh(vertex2);
					to_polymsh(vertex3);

					triangles_verts.push(vertex1);
					triangles_verts.push(vertex2);
					triangles_verts.push(vertex3);
					
					var found_mat = false;
					var mat_len = mat_clusters.length;
					
					for ( var c = 0 ; c < mat_len; c++ )
					{
						if( mat_clusters[c].name == mat_name)
						{
						  found_mat = true;
						  break;
						}	
					}
					
					if(!found_mat) // && (mat_len > 0)
					{
						mat_clusters.push(new mat_cluster(mat_name)); mat_clusters[mat_len].poly = tri_index /4;
						// logmessage(mat_name + ": " + tri_index /4);
					}
					
			}
			break;
		}
		
	}
}


function import_envelope()
{	
	oEnvelope = mesh.ApplyEnvelope(deformers_list);

	// organise vertex weights per deformer (list)
	// so it can be easily written into the XSI envelope (which lists vertex + weight PER deformer)
	// where SMD lists several deformers and the weight per vertex
	
	// pre-fill the bone list
	// TODO create an empty array nodes.length instead of pushing 
	var Bone_list = new Array(); // nodes.length
	for ( var i = 0 ; i < nodes.length ; i++)  { Bone_list.push(new Array()); }
	
	for ( var i = 0 ; i < smd_tris.length ; i++) // loop through vertricies
	{
		for ( var w = 0 ; w < smd_tris[i].weights.length ; w++) // loop through weights of a vertex
		{
		// logmessage(i + " " + smd_tris[i].weights[w].boneWeight)
			var vert_weight  = new vertex_weight(i + " " + smd_tris[i].weights[w].boneWeight);
			Bone_list[smd_tris[i].weights[w].boneID].push(vert_weight);
		}
	}

	// loop through deforms list
	// set all weights to zero for each deformer in the weight map
	// TODO this is slow, we need to find a way to set all weights to zero without having
	// to loop through every single one and avoid doing the second loop (// set weights per deformer)
	for ( var i = 0 ; i < deformers_list.count; i++) 
	{
		// var vert_count = mesh.ActivePrimitive.Geometry.Points.Count;
	
		// TODO create an empty array of size of the vert count, instead of getting the one from the evenlope
		// this also ensure values are set to 0 and its faster than reseting values with a for loop...
		
	 	var vba = new VBArray(oEnvelope.getdeformerweights(deformers_list(i)));
		var weights = vba.toArray();
		
		for( var w=0; w<weights.length; w++ )
		{
			weights[w] = 0;
		}

		oEnvelope.setdeformerweights2(deformers_list(i), weights);
	}

	// loop through deformers list
	// set weights per deformer
	for ( var i = 0 ; i < deformers_list.count; i++) 
	{
		// var vert_count = mesh.ActivePrimitive.Geometry.Points.Count;
	
		// TODO create an empty array of size of the vert count, instead of getting the one from the evenlope
		// this also ensure values are set to 0 and its faster than reseting values with a for loop...
		
		var vba = new VBArray(oEnvelope.getdeformerweights(deformers_list(i)));
		var weights = vba.toArray();
		
		for( var w=0; w<weights.length; w++ )
		{
			weights[w] = 0;
		}
	 	var vba = new VBArray(oEnvelope.getdeformerweights(deformers_list(i)));
		var weights = vba.toArray();
		
			for( var w=0; w< Bone_list[i].length; w++ )
			{
				// logmessage( weights[i] )
				weights[Bone_list[i][w].index] = Bone_list[i][w].weight * 100;
				// logmessage(Bone_list[i][w].index + " " +  Bone_list[i][w].weight);
			}

			// LogMessage("deformer: " + deformers_list(i) + weights[0]);
			oEnvelope.setdeformerweights2(deformers_list(i), weights);
	}
	
}

function import_UVs()
{	
    var oGeometry = mesh.ActivePrimitive.Geometry;
    var oCluster = oGeometry.AddCluster(siSampledPointCluster, "Texture_Coordinates");
    var oUVs = oCluster.AddProperty("Texture Projection", false, "Texture_Projection");
	
	var oGridData = XSIFactory.CreateGridData();
	oGridData.Data = oUVs.Elements.Array;

	for ( var i = 0; i < oGridData.RowCount; i++ ) 
	{
		oGridData.SetCell(0,i, parseFloat(triangles_verts[i].u));
		oGridData.SetCell(1,i, parseFloat(triangles_verts[i].v));
	}	
	
	oUVs.Elements.Array = oGridData.Data;
}


function import_normals()
{
	var oGeometry = mesh.ActivePrimitive.Geometry;
    var oCluster = oGeometry.AddCluster( siSampledPointCluster, "User_Normal" );
    var oUserNormals = oCluster.AddProperty( "User Normal Property", false, "User_Normal_Property" );
 
    var oUserNormalData = XSIFactory.CreateGridData();
    oUserNormalData.Data = oUserNormals.Elements.Array;
 
    var NormCount = oUserNormalData.RowCount;
 
    for ( var i = 0; i < NormCount; i++ ) 
    {
       var aUserNormal = ( oUserNormalData.GetRowValues(i)).toArray();
 
       aUserNormal[0] = parseFloat(triangles_verts[i].normX);
       aUserNormal[1] = parseFloat(triangles_verts[i].normY);
       aUserNormal[2] = parseFloat(triangles_verts[i].normZ);
	   
       oUserNormalData.SetRowValues( i, aUserNormal );
    }


	oUserNormals.Elements.Array = oUserNormalData.Data;

}


function build_mesh()
{
	if((verticies.length == 0) || (polygons.length == 0))
	{
		logmessage("Error verticies or polygons list are null!", siError);
		return;
	}
	
	mesh = oModel.AddPolygonMesh(verticies,polygons, "mesh");
}

function build_rig()
{
// skeleton[i].Nodes.length

	if (nodes.length == 0) { logmessage("SMD Import: model doesn't have bones.", siError); return;}
	if (skeleton.length == 0) { logmessage("SMD Import: model doesn't have bone animations.", siError); return;}
	if (skeleton[0].Nodes.length == 0) { logmessage("SMD Import: model doesn't have bone animations.", siError); return;}

	// get null preset, sets its info (name parent, pos/rot shape, size etc)
	// create it
	var bones_list = "";

	for ( var i = 0 ; i < nodes.length ; i++ )
	{
		var t = skeleton[0].Nodes[nodes[i].BoneID];

		// get and set parent
		var parent = oModel;
		if(get_node_parentName(nodes[i].ParentID) != "")
		{
			parent = oModel.FindChild(get_node_parentName(nodes[i].ParentID), siNullPrimType, siNullPrimitiveFamily, true);
		}
		
		// add null to scene
		var oNull = parent.AddNull(nodes[i].BoneName);
		//oNull.size = 0.5;
		oNull.primary_icon = 4;
		deformers_list.Add(oNull);
		// set transform
		oNewLocalTransform = XSIMath.CreateTransform();
		oNewLocalTransform.SetTranslationFromValues(t.posX,t.posY,t.posZ)
		oNewLocalTransform.SetRotationFromXYZAnglesValues(t.rotX,t.rotY,t.rotZ);

		oNull.Kinematics.Local.Transform = oNewLocalTransform ;
		
		bones_list =  bones_list + oNull.FullName + ", ";
		
	}

	// Apply envelope(oEnvelopeGroup) + deformer bones (deformers_list) to the mesh (oModel)
	var oEnvelopeGroup = oModel.AddGroup(deformers_list, "Envelope", false);

}




function get_node_parentName(arg)
{
	var name = "";
	if(arg != -1)
	{
		name = nodes[arg].BoneName;
	}
	return name;
}


function toDeg(arg)
{
	return XSIMath.RadiansToDegrees(arg);
}

function trim(str) 
{
    return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
}


function readfile(in_FilePath)
{
	var forReading = 1, forWriting = 2, forAppending = 8;

	//  define array to store lines. 
	rline = new Array();

	//  Create the object 
	fs = new ActiveXObject("Scripting.FileSystemObject");
	
	var f = fs.OpenTextFile(in_FilePath, 1 );
	var s = f.ReadAll();

	return s;
}


// Rebuild vertex and polygon definitions
function to_polymsh(vertex)
{
	vert_index = -1;
	// check that value is set
	if(vertex)
	{
	
	// we use a reverse while loop because its MUCH faster than a for loop, this is a pretty slow operation anyways
	var i = smd_tris.length; while (i--) 
	{
		var tri = smd_tris[i];
		// find a triangle's vert "tri." that has the same position as "vertex."
		if ((tri.posX == vertex.posX) && (tri.posY == vertex.posY) && (tri.posZ == vertex.posZ))
		{
			vert_index = i;
			break;
		}
	}

	if(vert_index == -1) { smd_tris.push(vertex); }	
		
		var poly_index = -1;
		
		// if we find the exact same vertex in the vertex array then we don't add it
		//  and we add the found index to the polygons list
		if (vert_index > -1) 
		{ 
			// vertex already exists in the vertex array
			// we add the vertex index in the polygons list
			polygons.push(vert_index);
			poly_index = vert_index;
			
		} 
		else 
		{
			// not found, we add the vertex position to the vertex array and its index to the polygons array
			verticies.push(parseFloat(vertex.posX,10), parseFloat(vertex.posY,10), parseFloat(vertex.posZ,10)); 
			polygons.push((verticies.length /3) -1);
			poly_index = (verticies.length /3) -1;

		}
		
		
	}	
}

function SMD_Tri(arg)
{
	// clean string and split it
	arg = arg.split(' ');

	this.parent_bone = arg[0];
	
	this.posX = arg[1];
	this.posY = arg[2];
	this.posZ = arg[3];
	
	this.normX = arg[4];
	this.normY = arg[5];
	this.normZ = arg[6];
	
	this.u = arg[7];
	this.v = arg[8];
	
	this.links = arg[9];
	
	
	this.weights = new Array();
	
	// get bones their weight on the vertex
	for ( var i = 10  ; i < arg.length ; i+= 2 )
	{
		this.weights.push(new weight(arg[i] + " " + arg[i +1]));
	}

	// if it has no weight, we set the weight to the parent node (first argument of the line arg[0])
	if (this.weights.length == 0)
	{
		this.weights.push(new weight(arg[0] + " 1"));
	}
}

function weight(arg)
{
	arg = arg.split(' ');
	this.boneID = arg[0]; 
	this.boneWeight = arg[1];
	
	// this.getboneID = function() { return this.boneID; }
	// this.getBoneWeight = function() { return this.boneWeight; }
}

function node(arg)
{
	arg = arg.split(' ');
	this.BoneID = arg[0];
	this.BoneName = arg[1].replace(/['"]/g,'').replace(".", "-"); // remove quotes
	this.ParentID = arg[2];
}

function skeletonT(arg)
{
	this.Nodes = new Array();	
}

function skeleton_node(arg)
{
	arg = arg.split(' ');
	this.BoneID = arg[0]; 
	
	this.posX = parseFloat(arg[1]);
	this.posY = parseFloat(arg[2]);
	this.posZ = parseFloat(arg[3]);

	this.rotX = parseFloat(arg[4]);
	this.rotY = parseFloat(arg[5]);
	this.rotZ = parseFloat(arg[6]);
}


function deformers_weightList()
{
	this.bone_weights = new Array();
	this.addVertWeight = function(arg) 
	{ 
	 this.bone_weights.push(arg);
	}	
}

// for importing to xsi format
function weight_list()
{
	this.weights_array = new Array();
	
	this.addVertWeight = function(arg)
	{ 
	 this.weights_array.push(arg);
	}	
}
// for importing to xsi format
function vertex_weight(arg)
{
	arg = arg.split(" ");
	this.index = arg[0];
	this.weight = arg[1];
}


// store material name with polygon index
function mat_cluster(arg1, arg2)
{
	// arg = arg.split(" ");
	this.name = arg1;
	this.index = arg2;
}