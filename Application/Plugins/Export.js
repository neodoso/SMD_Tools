var oApplication = new ActiveXObject('XSI.Application');
var oXSIFactory = new ActiveXObject('XSI.Factory');

var WshShell = new ActiveXObject ("WScript.Shell");
var oFile;
var oBones_arr = new Array();
var local_transform = false;

function Main(args) // , model_name, parent
{
	// if polymesh is selected, select parent Model
	if(Selection(0).Type == "polymsh") 
	{ 
		if(Selection(0).Parent.Type == "#model")
		{
			SelectObj(Selection(0).Parent.FullName, null, null);
		}
	}
	
	if(Selection(0).type != "#model")
	{
		WshShell.Popup ("Error: selection is not a model object.");
		return true;
	}
	
	if (args) 
	{
		var args = args.split("#");
	
		//  get arguments (file_path, model_name, parent)
		var file_path = args[0];
		var name = file_path.replace(/^.*[\\\/]/, '').split('.')[0];
		//var model_name = args[1];
		//var parent = args[2];

		oRoot = Application.ActiveProject.ActiveScene.Root;

		Export_Model(file_path);	
	}
	
	//oProgressBar.Visible = false;
	return true;
}

function Export_Model(_filepath) 
{
	if(_filepath == "") { return; }
	var name = _filepath.replace(/^.*[\\\/]/, '').split('.')[0];
	
	var _model = Selection(0);
		
	oBones_arr = new Array();

	// get child meshes (not recusive)
	var child_items = _model.FindChildren2("", "polymsh", "", false);
	
	if (child_items.count == 0) { logmessage("Item named " + _model.FullName + " is empty."); return; }

	

	try 
	{
		var fso = oXSIFactory.CreateActiveXObject("Scripting.FileSystemObject");
		oFile = fso.CreateTextFile( _filepath , true );
	}
	catch(e)
	{
		LogMessage("Export failed! could not write file on disk.", siError);
		LogMessage(e.message);
		WshShell.Popup ("Error: Export Failed! could not write file on disk.");
		return;
	}


	// Write SMD header:
	oFile.Write( "version 1\n" );

	// build bone hierarchy for export (only built once, from the first mesh) // note this ignores roots effectors
	build_nodes(_model.findChildren("", "null")); // generates node array from model's children null hierachy
	
	// write triangles for each mesh
	oFile.Write( "triangles\n" );
						
	// export SMD's for each polymesh found in the main bone
	for (var x=0 ; x< _model.Children.Count; x++) 
	{
		if (_model.Children.Item(x).Type == "polymsh") 
		{
			var oMesh = _model.Children.Item(x);
			
			mat_name = _model.Children.Item(x).Name;
			mat_name = (_model.Children.Item(x).Name).replace("-", "");
			
			build_triangles(oMesh);
		}
	}

	oFile.Write( "end\n" );
	oFile.Close();
}


// we write the triangles
function build_triangles(_mesh)
{
	
	// Progress BAR
	var oProgressBar = XSIUIToolkit.ProgressBar;
	oProgressBar.Step = 1;
	oProgressBar.Caption = "Exporting SMD";
	oProgressBar.CancelEnabled = true;
	// disabled since there's a bug, progressbar won't close when using 
	//oProgressBar.Visible = true;

	var oGeometry = _mesh.ActivePrimitive.Geometry;
	var oDeformers; var aWeights; var cntDeformers; var cntVertices;

	// if mesh has enveloppe
	if( _mesh.Envelopes.Count > 0) 
	{	
		oEnvelope = _mesh.Envelopes(0);
		oDeformers = oEnvelope.Deformers;
		var aWeights = oEnvelope.Weights.Array.toArray();
		var cntDeformers = oEnvelope.Deformers.Count;
		var cntVertices = aWeights.length / cntDeformers;
		//var iElement = 0;
	}
	
	nNodeNumber = 0;

	// Write geometry
	var oFacets = oGeometry.Facets;
	var oTriangles = oGeometry.Triangles;
	var envelope_count = _mesh.Envelopes.Count;

	if( envelope_count > 0) { oDeformers = oEnvelope.Deformers; } // store it in a var, much faster to access

	
	oProgressBar.Maximum = oTriangles.Count;

	// Write triangles
	for ( i=0; i < oTriangles.Count; i++ )
	{
		var oTriangle = oTriangles(i);
		
		// Material write
		oFile.Write(mat_name + "\n" );

		for ( j=0; j < oTriangle.Points.Count; j++ )
		{		
			var Point = oTriangle.Points(j);
			var vert = oTriangle.Points(j).Index;
			var tmpweight = 0;
			var bone_count = 0;
			
			var mesh_Transform = _mesh.Kinematics.Global.Transform;
			if(local_transform) { mesh_Transform = _mesh.Kinematics.Local.Transform; }
			
			var transform = XSIMath.CreateTransform();
			var pos = XSIMath.MapObjectPositionToWorldSpace(mesh_Transform, Point.Position);
			var norm =Point.Normal;
			var uvs = Point.uv;
			
			// UV will be exported >>ONLY<< if the model has a material with a texture set, wreid Softimage bug
			// <int|Parent bone> <float|PosX PosY PosZ> <normal|NormX NormY NormZ> <normal|U V> <int|links> <int|Bone ID> <normal|Weight> 
			oFile.Write ( nNodeNumber + " "
				+ pos.X.toFixed(6) + " " + pos.Y.toFixed(6) + " " + pos.Z.toFixed(6) + "  "
				+ norm.X.toFixed(6) + " " + norm.Y.toFixed(6) + " " + norm.Z.toFixed(6) + "  "
				+ uvs.u.toFixed(6) + " " + uvs.v.toFixed(6) + "  ");

				strElementWeights = "" ;
					
				
			// if envelopped!
			if( envelope_count > 0) 
			{

				for (ideformer=0; ideformer< cntDeformers; ideformer++) 
				{
					tmpweight = ((aWeights[(vert * cntDeformers) + ideformer]) /100).toFixed(6);
					
					// only write if weight > 0
					if (tmpweight != 0) 
					{
						strElementWeights += get_node(oDeformers(ideformer).name) + " " + tmpweight + " ";
						// strElementWeights += get_node("bip_pelvis") + " " + tmpweight + " ";
						bone_count++;
					}
				}
				
				// if not envelopped set all vert's weights to bone 0
			} else {
				strElementWeights += "0" + " " + "1" + " ";
				bone_count++;
			}
				
			oFile.Write (bone_count + " " + strElementWeights + "\n");
		}
		/*
		if (oProgressBar.CancelPressed )
		{
			oProgressBar.visible = false;
			break;
		}	
		*/
		oProgressBar.Increment();
	}
	
		
	nNodeNumber++;
	oProgressBar.Visible = false;
}

// build bone list aka nodes and the first frame
function build_nodes(inBone)
{
	// add main bone to the bones array	
	for ( var i=0 ; i<inBone.Count; i++ ) 
	{
		var inbone = inBone.Item(i);
		var parent_name = inbone.Parent.Name;
		if (inbone.Type == "null")
		{
			
			// store rigging hierarchy in an array
			//oBones_arr = bone2array(inBone.Item(i),inBone.Item(i).Parent.Name);
			var parent_num = -1;
			var bkine = inbone.Kinematics.local;
			// bkine= XSIMath.MapObjectPositionToWorldSpace(inbone.Kinematics.Local.Transform, bkine.Position);
			
			var xpos = (bkine.Parameters("posx").value).toFixed(6);
			var ypos = (bkine.Parameters("posy").value).toFixed(6);
			var zpos = (bkine.Parameters("posz").value).toFixed(6);
			var yrot = (XSIMath.DegreesToRadians(bkine.Parameters("rotx").value)).toFixed(6);
			var prot = (XSIMath.DegreesToRadians(bkine.Parameters("roty").value)).toFixed(6);
			var rrot = (XSIMath.DegreesToRadians(bkine.Parameters("rotz").value)).toFixed(6);
			
			// if has a parent
			if (parent_name !== null) 
			{
				// search parent number
				for(var i=0; i < oBones_arr.length; i++)
				{
					if (oBones_arr[i][1]== parent_name) { parent_num= i; }
				}
				oBones_arr[oBones_arr.length] = new Array(oBones_arr.length,inbone.Name,parent_num,xpos,ypos,zpos,yrot,prot,rrot);
				
			}
			else // if main bone, parent = -1
			{
				oBones_arr[oBones_arr.length] = new Array(0,inbone.Name,-1,xpos,ypos,zpos,yrot,prot,rrot);
			}
		}
	}
	
	// wirte nodes
	// write nodes (aka bones)
	oFile.Write( "nodes\n" );

	for(var i=0; i < oBones_arr.length; i++)
	{
		oFile.Write("  " + oBones_arr[i][0] + " \"" + oBones_arr[i][1].replace("-", ".") + "\" " + oBones_arr[i][2] + "\n");
	}
	
	oFile.Write( "end\n" );
	oFile.Write( "skeleton\n" );
	oFile.Write( "time 0\n" );
	
	// bone positions and rotations
	for(var i=0; i < oBones_arr.length; i++)
	{
		oFile.Write("  " + oBones_arr[i][0] + " " + oBones_arr[i][3] + " " + oBones_arr[i][4] + " " + oBones_arr[i][5] + " " + oBones_arr[i][6] + " " + oBones_arr[i][7] + " " + oBones_arr[i][8] + "\n");
	}
	
	oFile.Write( "end\n" );
}


// returns node number given deformer name
function get_node(deformer_name)
{
	var result = -1;
	var i =  oBones_arr.length;
	while (i--)  // for(var i=0; i < oBones_arr.length; i++)
	{
		if (oBones_arr[i][1] == deformer_name) { result = oBones_arr[i][0]; }
	}
	
	return result;
}